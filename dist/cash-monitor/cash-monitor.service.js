"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var CashMonitorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CashMonitorService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const cash_intelligence_v2_service_1 = require("../cash-intelligence/cash-intelligence-v2.service");
const cash_classifier_service_1 = require("./cash-classifier.service");
const driver_amount_map_1 = require("./driver-amount-map");
const POLL_INTERVAL_MS = 60_000;
const SHIFT_PRE_OVERDUE_HOURS = 14;
const SHIFT_OVERDUE_HOURS = 16;
const HIGH_DRIVER_EXPOSURE_KD = 500;
const ALERT_DEDUP_WINDOW_MS = 5 * 60_000;
const ALERT_RING_BUFFER_SIZE = 200;
let CashMonitorService = CashMonitorService_1 = class CashMonitorService {
    v2;
    classifier;
    logger = new common_1.Logger(CashMonitorService_1.name);
    pollInProgress = false;
    pollPromise = null;
    lastSnapshot = null;
    lastPollAt = null;
    lastPollErrorAt = null;
    lastPollError = null;
    alertsRing = [];
    lastEmittedAt = new Map();
    bootstrapped = false;
    snapshotListeners = [];
    constructor(v2, classifier) {
        this.v2 = v2;
        this.classifier = classifier;
    }
    onOperationalSnapshot(listener) {
        this.snapshotListeners.push(listener);
        return () => {
            const idx = this.snapshotListeners.indexOf(listener);
            if (idx >= 0)
                this.snapshotListeners.splice(idx, 1);
        };
    }
    onModuleDestroy() {
        this.alertsRing.length = 0;
        this.lastEmittedAt.clear();
        this.lastSnapshot = null;
    }
    async getLive() {
        if (!this.lastSnapshot) {
            await this.pollSafe();
        }
        return this.composeLive();
    }
    async getOperationalView() {
        if (!this.lastSnapshot) {
            await this.pollSafe();
        }
        return this.composeOperational();
    }
    async getClassified() {
        if (!this.lastSnapshot) {
            await this.pollSafe();
        }
        if (!this.lastSnapshot) {
            return this.classifier.classify();
        }
        return this.classifier.composeFromAnalysis(this.lastSnapshot);
    }
    async peekSnapshot() {
        if (!this.lastSnapshot) {
            await this.pollSafe();
        }
        return this.lastSnapshot;
    }
    async pollSafe() {
        if (this.pollPromise)
            return this.pollPromise;
        this.pollPromise = this.runPoll().finally(() => {
            this.pollPromise = null;
        });
        return this.pollPromise;
    }
    async runPoll() {
        this.pollInProgress = true;
        try {
            const start = Date.now();
            const snapshot = await this.v2.runAnalysis({});
            const elapsed = Date.now() - start;
            this.processSnapshot(snapshot);
            this.lastPollAt = new Date();
            this.lastPollError = null;
            this.lastPollErrorAt = null;
            this.logger.debug(`cash-monitor poll ok in ${elapsed}ms — flows=${snapshot.flows.length}, anomalies=${snapshot.anomalies.length}`);
        }
        catch (e) {
            this.lastPollError = e.message ?? String(e);
            this.lastPollErrorAt = new Date();
            this.logger.warn(`cash-monitor poll failed: ${this.lastPollError}`);
        }
        finally {
            this.pollInProgress = false;
        }
    }
    processSnapshot(curr) {
        const prev = this.lastSnapshot;
        const now = new Date();
        const classified = this.classifier.composeFromAnalysis(curr);
        const amountMap = (0, driver_amount_map_1.buildDriverAmountMap)(classified);
        if (this.bootstrapped && prev) {
            this.emitDiffAlerts(prev, curr, now);
        }
        this.emitMirroredAnomalies(curr, now);
        this.emitPreShiftOverdue(curr, now, amountMap);
        this.emitHighDriverExposure(curr, now, amountMap);
        this.lastSnapshot = curr;
        this.bootstrapped = true;
        if (this.snapshotListeners.length > 0) {
            const op = this.composeOperational();
            for (const l of this.snapshotListeners) {
                try {
                    l(op);
                }
                catch (e) {
                    this.logger.warn(`snapshot listener threw: ${e.message}`);
                }
            }
        }
    }
    emitDiffAlerts(prev, curr, now) {
        const prevFlowByOrder = new Map();
        for (const f of prev.flows) {
            const key = flowKey(f);
            if (key)
                prevFlowByOrder.set(key, f);
        }
        for (const f of curr.flows) {
            const key = flowKey(f);
            if (!key)
                continue;
            const before = prevFlowByOrder.get(key);
            if (!before) {
                this.tryEmit(now, {
                    type: 'NEW_FLOW',
                    severity: 'INFO',
                    driverId: f.driverId || null,
                    driverName: f.driverName,
                    branchId: f.branchId,
                    amount: f.amount,
                    message: `New live cash flow detected at stage ${f.stage} (${f.amountTier} ${f.amount} KD).`,
                    countdownMinutes: null,
                    isPrediction: false,
                    dedupKey: `NEW_FLOW|${f.driverId}|${key}`,
                });
                continue;
            }
            if (before.stage !== f.stage) {
                this.tryEmit(now, {
                    type: 'STAGE_CHANGED',
                    severity: 'INFO',
                    driverId: f.driverId || null,
                    driverName: f.driverName,
                    branchId: f.branchId,
                    amount: f.amount,
                    message: `Stage transition: ${before.stage} → ${f.stage}.`,
                    countdownMinutes: null,
                    isPrediction: false,
                    dedupKey: `STAGE_CHANGED|${f.driverId}|${key}|${before.stage}>${f.stage}`,
                });
            }
            else if (before.amount !== f.amount) {
                this.tryEmit(now, {
                    type: 'FLOW_UPDATED',
                    severity: 'INFO',
                    driverId: f.driverId || null,
                    driverName: f.driverName,
                    branchId: f.branchId,
                    amount: f.amount,
                    message: `Flow amount changed: ${before.amount} → ${f.amount} KD.`,
                    countdownMinutes: null,
                    isPrediction: false,
                    dedupKey: `FLOW_UPDATED|${f.driverId}|${key}|${f.amount}`,
                });
            }
        }
        const prevAnomalies = new Map();
        for (const a of prev.anomalies) {
            prevAnomalies.set(anomalyKey(a), a);
        }
        for (const a of curr.anomalies) {
            const k = anomalyKey(a);
            const before = prevAnomalies.get(k);
            if (!before) {
                this.tryEmit(now, {
                    type: 'NEW_ANOMALY',
                    severity: severityToMonitor(a.severity),
                    driverId: a.driverId,
                    driverName: null,
                    branchId: a.branchId,
                    amount: a.amount,
                    message: `New anomaly: ${a.type} — ${a.reason}`,
                    countdownMinutes: null,
                    isPrediction: false,
                    dedupKey: `NEW_ANOMALY|${k}`,
                });
            }
            else if (severityRank(a.severity) > severityRank(before.severity)) {
                this.tryEmit(now, {
                    type: 'SEVERITY_ESCALATED',
                    severity: severityToMonitor(a.severity),
                    driverId: a.driverId,
                    driverName: null,
                    branchId: a.branchId,
                    amount: a.amount,
                    message: `Severity escalated for ${a.type}: ${before.severity} → ${a.severity}.`,
                    countdownMinutes: null,
                    isPrediction: false,
                    dedupKey: `SEVERITY_ESCALATED|${k}|${before.severity}>${a.severity}`,
                });
            }
        }
    }
    emitMirroredAnomalies(curr, now) {
        for (const a of curr.anomalies) {
            if (a.type === 'SUBSCRIPTION_LEAKAGE')
                continue;
            const severity = a.type === 'SHIFT_OVERDUE'
                ? 'CRITICAL'
                : severityToMonitor(a.severity);
            this.tryEmit(now, {
                type: a.type,
                severity,
                driverId: a.driverId,
                driverName: null,
                branchId: a.branchId,
                amount: a.amount,
                message: `${a.type}: ${a.reason}`,
                countdownMinutes: null,
                isPrediction: false,
                dedupKey: anomalyKey(a),
            });
        }
    }
    emitPreShiftOverdue(curr, now, amountMap) {
        const perDriver = groupByDriver(curr.flows);
        for (const [driverId, group] of perDriver.entries()) {
            const open = group.find((f) => f.shiftStatus === 'OPEN');
            if (!open)
                continue;
            const dur = open.shiftDurationHours;
            if (dur === null)
                continue;
            if (dur < SHIFT_PRE_OVERDUE_HOURS)
                continue;
            if (dur >= SHIFT_OVERDUE_HOURS)
                continue;
            const totalKd = (0, driver_amount_map_1.getDriverAmountKd)(amountMap, driverId);
            const totalLabel = (0, driver_amount_map_1.getDriverAmountStr)(amountMap, driverId);
            const tierIsLarge = group.some((f) => f.amountTier === 'LARGE') || totalKd >= 200;
            if (!tierIsLarge)
                continue;
            const minutesToOverdue = Math.max(0, Math.round((SHIFT_OVERDUE_HOURS - dur) * 60));
            this.tryEmit(now, {
                type: 'PRE_SHIFT_OVERDUE',
                severity: 'WARNING',
                driverId,
                driverName: open.driverName,
                branchId: open.branchId,
                amount: totalLabel,
                message: `Driver is approaching shift overdue with high cash exposure (${totalLabel} KD, shift ${dur.toFixed(2)}h).`,
                countdownMinutes: minutesToOverdue,
                isPrediction: true,
                dedupKey: `PRE_SHIFT_OVERDUE|${driverId}`,
            });
        }
    }
    emitHighDriverExposure(curr, now, amountMap) {
        const perDriver = groupByDriver(curr.flows);
        for (const [driverId, group] of perDriver.entries()) {
            const totalKd = (0, driver_amount_map_1.getDriverAmountKd)(amountMap, driverId);
            const totalLabel = (0, driver_amount_map_1.getDriverAmountStr)(amountMap, driverId);
            if (totalKd <= HIGH_DRIVER_EXPOSURE_KD)
                continue;
            const sample = group[0];
            this.tryEmit(now, {
                type: 'HIGH_DRIVER_EXPOSURE',
                severity: 'WARNING',
                driverId,
                driverName: sample.driverName,
                branchId: sample.branchId,
                amount: totalLabel,
                message: `Driver carries ${totalLabel} KD in live cash (threshold ${HIGH_DRIVER_EXPOSURE_KD} KD). Visibility advisory; no responsibility assigned.`,
                countdownMinutes: null,
                isPrediction: false,
                dedupKey: `HIGH_DRIVER_EXPOSURE|${driverId}`,
            });
        }
    }
    tryEmit(now, alert) {
        const key = alert.dedupKey ?? `${alert.type}|${alert.driverId ?? ''}|${alert.amount}`;
        const last = this.lastEmittedAt.get(key);
        if (last && now.getTime() - last < ALERT_DEDUP_WINDOW_MS)
            return;
        this.lastEmittedAt.set(key, now.getTime());
        const stamped = {
            ...alert,
            timestamp: now.toISOString(),
            dedupKey: key,
        };
        this.alertsRing.unshift(stamped);
        if (this.alertsRing.length > ALERT_RING_BUFFER_SIZE) {
            this.alertsRing.length = ALERT_RING_BUFFER_SIZE;
        }
    }
    composeLive() {
        const snapshot = this.lastSnapshot;
        const now = new Date();
        const lastPollAgeSeconds = this.lastPollAt !== null
            ? Math.round((now.getTime() - this.lastPollAt.getTime()) / 1000)
            : null;
        if (!snapshot) {
            return {
                timestamp: now.toISOString(),
                lastPollAt: null,
                lastPollAgeSeconds: null,
                realtimeStatus: 'GREEN',
                activeDrivers: 0,
                preRisk: [],
                alerts: [],
                driversAtRisk: [],
                locationSummary: { DRIVER: '0.0000', CUSTODY: '0.0000', BANK: '0.0000' },
                summary: {
                    totalCash: '0.0000',
                    driversAtRisk: 0,
                    activeAnomalies: 0,
                    openShifts: 0,
                },
                readOnly: true,
                advisoryOnly: true,
            };
        }
        const recentAlerts = this.alertsRing.slice(0, 50);
        const preRisk = recentAlerts.filter((a) => a.type === 'PRE_SHIFT_OVERDUE' || a.isPrediction);
        const classified = this.classifier.composeFromAnalysis(snapshot);
        const realtimeStatus = classified.systemStatus;
        const amountMap = (0, driver_amount_map_1.buildDriverAmountMap)(classified);
        const drivers = this.computeDriversAtRisk(snapshot, amountMap);
        const openShiftsCount = (() => {
            const set = new Set();
            for (const f of snapshot.flows) {
                if (f.shiftStatus === 'OPEN' && f.driverId)
                    set.add(f.driverId);
            }
            return set.size;
        })();
        return {
            timestamp: now.toISOString(),
            lastPollAt: this.lastPollAt?.toISOString() ?? null,
            lastPollAgeSeconds,
            realtimeStatus,
            activeDrivers: groupByDriver(snapshot.flows).size,
            preRisk,
            alerts: recentAlerts,
            driversAtRisk: drivers,
            locationSummary: snapshot.locationSummary,
            summary: {
                totalCash: (0, driver_amount_map_1.sumClassifiedKdLabel)(classified),
                driversAtRisk: drivers.length,
                activeAnomalies: snapshot.anomalies.length,
                openShifts: openShiftsCount,
            },
            readOnly: true,
            advisoryOnly: true,
        };
    }
    composeOperational() {
        const snap = this.lastSnapshot;
        const now = new Date();
        if (!snap) {
            return {
                timestamp: now.toISOString(),
                realtimeStatus: 'GREEN',
                activeDrivers: [],
                driversAtRisk: [],
                alerts: [],
                hidden: {
                    staleDriversCount: 0,
                    excludedAlertCount: 0,
                    note: 'Hidden inactive shifts with no financial impact',
                },
                summary: {
                    totalDriversShown: 0,
                    totalCash: '0.0000',
                    driversAtRisk: 0,
                    activeAlerts: 0,
                },
                readOnly: true,
                advisoryOnly: true,
            };
        }
        const reportDay = snap.executionSummary.asOfDate;
        const classified = this.classifier.composeFromAnalysis(snap);
        const classifierIndex = buildClassifierIndex(classified);
        const amountMap = (0, driver_amount_map_1.buildDriverAmountMap)(classified);
        const aggByDriver = new Map();
        const ensureAgg = (driverId, driverName, branchId, shiftStatus, shiftDurationHours) => {
            let a = aggByDriver.get(driverId);
            if (!a) {
                a = {
                    driverId,
                    driverName,
                    branchId,
                    ordersTodayCount: 0,
                    collectedCashTodayKd: 0,
                    lastCashActivityDate: null,
                    shiftStatus,
                    shiftDurationHours,
                    oldestAgeHours: 0,
                };
                aggByDriver.set(driverId, a);
            }
            else {
                if (!a.driverName && driverName)
                    a.driverName = driverName;
                if (!a.branchId && branchId)
                    a.branchId = branchId;
                if (a.shiftStatus !== 'OPEN' && shiftStatus === 'OPEN') {
                    a.shiftStatus = 'OPEN';
                    a.shiftDurationHours = shiftDurationHours;
                }
            }
            return a;
        };
        for (const f of snap.flows) {
            if (!f.driverId)
                continue;
            const agg = ensureAgg(f.driverId, f.driverName, f.branchId, f.shiftStatus, f.shiftDurationHours);
            const amt = parseAmount(f.amount);
            if (f.originDate === reportDay) {
                agg.ordersTodayCount += 1;
                agg.collectedCashTodayKd += amt;
            }
            if (!agg.lastCashActivityDate ||
                f.originDate > agg.lastCashActivityDate) {
                agg.lastCashActivityDate = f.originDate;
            }
            if (f.ageHours > agg.oldestAgeHours) {
                agg.oldestAgeHours = f.ageHours;
            }
        }
        for (const a of snap.anomalies) {
            if (a.type !== 'SHIFT_OVERDUE')
                continue;
            if (!a.driverId)
                continue;
            if (aggByDriver.has(a.driverId))
                continue;
            ensureAgg(a.driverId, null, a.branchId, 'OPEN', null);
        }
        const classifyDriver = (a) => {
            const hasTodayActivity = a.ordersTodayCount > 0 || a.collectedCashTodayKd > 0;
            const hasExposure = (0, driver_amount_map_1.getDriverAmountKd)(amountMap, a.driverId) > 0;
            if (a.shiftStatus === 'OPEN' && !hasTodayActivity && !hasExposure) {
                return 'STALE';
            }
            if (!hasTodayActivity && hasExposure) {
                return 'EXPOSURE_ONLY';
            }
            const dur = a.shiftDurationHours ?? 0;
            const nearOverdue = a.shiftStatus === 'OPEN' && dur >= 14;
            if (hasTodayActivity && (hasExposure || nearOverdue)) {
                return 'AT_RISK';
            }
            return 'ACTIVE';
        };
        const SHIFT_OVERDUE_HOURS = 16;
        const buildActive = (a, status) => {
            const dur = a.shiftDurationHours;
            const countdown = dur !== null && a.shiftStatus === 'OPEN' && dur < SHIFT_OVERDUE_HOURS
                ? Math.max(0, Math.round((SHIFT_OVERDUE_HOURS - dur) * 60))
                : null;
            return {
                driverId: a.driverId,
                driverName: a.driverName,
                branchId: a.branchId,
                ordersTodayCount: a.ordersTodayCount,
                collectedCashToday: a.collectedCashTodayKd.toFixed(4),
                totalCash: (0, driver_amount_map_1.getDriverAmountStr)(amountMap, a.driverId),
                lastCashActivityDate: a.lastCashActivityDate,
                shiftStatus: a.shiftStatus,
                shiftDurationHours: a.shiftDurationHours,
                countdownMinutes: countdown,
                status,
            };
        };
        const shownDrivers = [];
        const atRisk = [];
        let staleCount = 0;
        const hiddenDriverIds = new Set();
        for (const a of aggByDriver.values()) {
            const status = classifyDriver(a);
            if (status === 'STALE') {
                staleCount += 1;
                hiddenDriverIds.add(a.driverId);
                continue;
            }
            const dto = buildActive(a, status);
            shownDrivers.push(dto);
            if (status === 'AT_RISK' || status === 'EXPOSURE_ONLY') {
                atRisk.push(dto);
            }
        }
        const operationalAlerts = [];
        let excludedAlertCount = 0;
        for (const a of snap.anomalies) {
            if (a.driverId && hiddenDriverIds.has(a.driverId)) {
                excludedAlertCount += 1;
                continue;
            }
            if (a.type === 'SUBSCRIPTION_LEAKAGE') {
                excludedAlertCount += 1;
                continue;
            }
            const driverAgg = a.driverId ? aggByDriver.get(a.driverId) : undefined;
            const classifierMatch = lookupClassifierAlert(classifierIndex, a);
            const opDomain = classifierMatch?.domain ?? 'COMPLIANCE';
            const opSeverity = classifierMatch?.severity ?? 'INFO';
            let opType;
            let originalType = null;
            if (a.type === 'SHIFT_OVERDUE') {
                originalType = 'SHIFT_OVERDUE';
                opType =
                    opDomain === 'FINANCIAL'
                        ? 'SHIFT_OVERDUE_FINANCIAL'
                        : 'SHIFT_COMPLIANCE_DELAY';
            }
            else {
                opType = a.type;
            }
            operationalAlerts.push({
                type: opType,
                domain: opDomain,
                severity: opSeverity,
                driverId: a.driverId,
                driverName: driverAgg?.driverName ?? null,
                branchId: a.branchId,
                amount: a.amount,
                message: originalType
                    ? `${opType}: ${a.reason} (was ${originalType}; reclassified per classifier).`
                    : `${a.type}: ${a.reason}`,
                timestamp: this.lastPollAt?.toISOString() ?? now.toISOString(),
                countdownMinutes: null,
                isPrediction: false,
                originalType,
            });
        }
        for (const r of this.alertsRing) {
            if (r.type !== 'PRE_SHIFT_OVERDUE' && r.type !== 'HIGH_DRIVER_EXPOSURE') {
                continue;
            }
            if (r.driverId && hiddenDriverIds.has(r.driverId)) {
                excludedAlertCount += 1;
                continue;
            }
            operationalAlerts.push({
                type: r.type,
                domain: 'COMPLIANCE',
                severity: r.severity,
                driverId: r.driverId,
                driverName: r.driverName,
                branchId: r.branchId,
                amount: r.amount,
                message: r.message,
                timestamp: r.timestamp,
                countdownMinutes: r.countdownMinutes,
                isPrediction: r.isPrediction,
                originalType: null,
            });
        }
        shownDrivers.sort((a, b) => parseFloat(b.totalCash) - parseFloat(a.totalCash));
        atRisk.sort((a, b) => parseFloat(b.totalCash) - parseFloat(a.totalCash));
        const realtimeStatus = classified.systemStatus;
        return {
            timestamp: now.toISOString(),
            realtimeStatus,
            activeDrivers: shownDrivers,
            driversAtRisk: atRisk,
            alerts: operationalAlerts,
            hidden: {
                staleDriversCount: staleCount,
                excludedAlertCount,
                note: 'Hidden inactive shifts with no financial impact',
            },
            summary: {
                totalDriversShown: shownDrivers.length,
                totalCash: (0, driver_amount_map_1.sumClassifiedKdLabel)(classified),
                driversAtRisk: atRisk.length,
                activeAlerts: operationalAlerts.length,
            },
            readOnly: true,
            advisoryOnly: true,
        };
    }
    computeDriversAtRisk(snap, amountMap) {
        const out = [];
        const groups = groupByDriver(snap.flows);
        for (const [driverId, group] of groups.entries()) {
            const totalStr = (0, driver_amount_map_1.getDriverAmountStr)(amountMap, driverId);
            const totalKd = (0, driver_amount_map_1.getDriverAmountKd)(amountMap, driverId);
            const sample = group[0];
            const dur = group.find((f) => f.shiftStatus === 'OPEN')?.shiftDurationHours
                ?? null;
            const isAtRisk = totalKd > HIGH_DRIVER_EXPOSURE_KD ||
                (dur !== null && dur >= SHIFT_PRE_OVERDUE_HOURS);
            if (!isAtRisk)
                continue;
            out.push({
                driverId,
                driverName: sample.driverName,
                branchId: sample.branchId,
                totalCash: totalStr,
                flowsCount: group.length,
                shiftStatus: sample.shiftStatus,
                shiftDurationHours: dur,
                countdownMinutes: dur !== null && dur < SHIFT_OVERDUE_HOURS
                    ? Math.max(0, Math.round((SHIFT_OVERDUE_HOURS - dur) * 60))
                    : null,
            });
        }
        out.sort((a, b) => parseFloat(b.totalCash) - parseFloat(a.totalCash));
        return out;
    }
};
exports.CashMonitorService = CashMonitorService;
__decorate([
    (0, schedule_1.Interval)('cash-monitor-poll', POLL_INTERVAL_MS),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CashMonitorService.prototype, "pollSafe", null);
exports.CashMonitorService = CashMonitorService = CashMonitorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [cash_intelligence_v2_service_1.CashIntelligenceV2Service,
        cash_classifier_service_1.CashClassifierService])
], CashMonitorService);
function parseAmount(s) {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
}
function flowKey(f) {
    return `${f.driverId || '_'}|${f.originDate}|${f.amount}|${f.stage}`;
}
function anomalyKey(a) {
    return `${a.type}|${a.driverId ?? '_'}|${a.amount}|${a.stage}`;
}
function groupByDriver(flows) {
    const m = new Map();
    for (const f of flows) {
        if (!f.driverId)
            continue;
        const list = m.get(f.driverId) ?? [];
        list.push(f);
        m.set(f.driverId, list);
    }
    return m;
}
function severityToMonitor(s) {
    if (s === 'CRITICAL' || s === 'CRITICAL_ESCALATED')
        return 'CRITICAL';
    if (s === 'WARNING')
        return 'WARNING';
    return 'INFO';
}
function severityRank(s) {
    if (s === 'CRITICAL_ESCALATED')
        return 4;
    if (s === 'CRITICAL')
        return 3;
    if (s === 'WARNING')
        return 2;
    return 1;
}
function buildClassifierIndex(classified) {
    const idx = new Map();
    for (const a of classified.financialAlerts)
        addToIndex(idx, a);
    for (const a of classified.complianceAlerts)
        addToIndex(idx, a);
    return idx;
}
function addToIndex(idx, a) {
    const key1 = classifierIndexKey(a.driverId, a.originalType ?? a.type);
    if (!idx.has(key1))
        idx.set(key1, a);
    const key2 = classifierIndexKey(a.driverId, a.type);
    if (!idx.has(key2))
        idx.set(key2, a);
}
function classifierIndexKey(driverId, type) {
    return `${driverId ?? 'null'}::${type}`;
}
function lookupClassifierAlert(idx, a) {
    return idx.get(classifierIndexKey(a.driverId, a.type));
}
void null;
//# sourceMappingURL=cash-monitor.service.js.map