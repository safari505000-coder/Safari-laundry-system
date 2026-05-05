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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CashRiskService = void 0;
const common_1 = require("@nestjs/common");
const cash_intelligence_v2_service_1 = require("../cash-intelligence/cash-intelligence-v2.service");
const cash_execution_tracker_service_1 = require("./cash-execution-tracker.service");
const cash_classifier_service_1 = require("./cash-classifier.service");
const cash_rules_1 = require("./cash-rules");
const driver_amount_map_1 = require("./driver-amount-map");
const GRACE_PERIOD_HOURS = cash_rules_1.CASH_RULES.GRACE_HOURS;
const SHIFT_OVERDUE_CAP_HOURS = cash_rules_1.CASH_RULES.SHIFT_CAP_HOURS;
const SMALL_TIER_KD = cash_rules_1.CASH_RULES.MIN_CRITICAL_AMOUNT_KD;
const ANOMALY_AMOUNT_FLOOR_KD = cash_rules_1.CASH_RULES.MIN_CRITICAL_AMOUNT_KD;
const LARGE_TIER_KD = 100;
const BEHAVIOR_LATE_THRESHOLD = 3;
const BEHAVIOR_MULTIPLIER = 1.5;
const SEVERITY_BANDS = {
    warning: 50,
    risk: 150,
    critical: 300,
};
const RISK_ANOMALY_TYPES = new Set([
    'STUCK_AT_DRIVER',
    'HANDOVER_DELAY',
    'CUSTODY_DELAY',
    'DEPOSIT_NOT_REGISTERED',
    'DEPOSIT_AMOUNT_MISMATCH',
    'DOUBLE_COUNT_RISK',
    'OVERPAYMENT_ANOMALY',
    'SUBSCRIPTION_LEAKAGE',
]);
let CashRiskService = class CashRiskService {
    v2;
    tracker;
    classifier;
    constructor(v2, tracker, classifier) {
        this.v2 = v2;
        this.tracker = tracker;
        this.classifier = classifier;
    }
    async computeRisk() {
        const analysis = await this.v2.runAnalysis({});
        const classified = this.classifier.composeFromAnalysis(analysis);
        const driverIds = uniqueDriverIds(analysis.flows);
        const lateCounts = await this.tracker.lateCountsByDriver(driverIds);
        return this.composeFromAnalysis(analysis, classified, lateCounts);
    }
    composeFromAnalysis(analysis, classified, lateCounts) {
        const flowsByDriver = new Map();
        for (const f of analysis.flows) {
            if (parseAmount(f.amount) === 0)
                continue;
            if (f.ignoredNonOperational &&
                f.driverGate !== 'SHIFT_OVERDUE') {
            }
            const key = f.driverId || 'UNATTRIBUTED';
            const list = flowsByDriver.get(key) ?? [];
            list.push(f);
            flowsByDriver.set(key, list);
        }
        const amountMap = (0, driver_amount_map_1.buildDriverAmountMap)(classified);
        const drivers = [];
        let agedCashKd = 0;
        let newCashKd = 0;
        for (const [driverId, units] of flowsByDriver) {
            const lateCount = lateCounts.get(driverId) ?? 0;
            const behaviorMultiplier = lateCount >= BEHAVIOR_LATE_THRESHOLD ? BEHAVIOR_MULTIPLIER : 1;
            let driverScore = 0;
            const breakdown = [];
            let allUnitsYoung = true;
            let hasAged = false;
            for (const u of units) {
                const amountKd = parseAmount(u.amount);
                if (u.ageHours < GRACE_PERIOD_HOURS) {
                    newCashKd += amountKd;
                    breakdown.push({
                        amount: u.amount,
                        ageDays: u.ageDays,
                        ageHours: u.ageHours,
                        score: 0,
                        classification: 'NEW_CASH',
                        stage: u.stage,
                    });
                    continue;
                }
                allUnitsYoung = false;
                hasAged = true;
                agedCashKd += amountKd;
                const base = amountKd * u.ageDays;
                const amountMultiplier = amountKd < SMALL_TIER_KD
                    ? 0.5
                    : amountKd > LARGE_TIER_KD
                        ? 2
                        : 1;
                const final = round2(base * amountMultiplier * behaviorMultiplier);
                driverScore += final;
                breakdown.push({
                    amount: u.amount,
                    ageDays: u.ageDays,
                    ageHours: u.ageHours,
                    score: final,
                    classification: 'AGED',
                    stage: u.stage,
                });
            }
            let status = classifyStatus(driverScore);
            const shiftDurationH = unitsMaxShiftHours(units);
            let shiftComplianceOnly = false;
            if (shiftDurationH !== null &&
                shiftDurationH > SHIFT_OVERDUE_CAP_HOURS &&
                allUnitsYoung) {
                shiftComplianceOnly = true;
                status = capAtWarning(status);
                for (const row of breakdown) {
                    if (row.classification === 'NEW_CASH')
                        row.classification = 'SHIFT_COMPLIANCE_ONLY';
                }
            }
            const driverAnomalies = analysis.anomalies.filter((a) => a.driverId === driverId && isRealRiskAnomaly(a, analysis.flows));
            const responsible = driverAnomalies.length > 0 ? driverAnomalies[0].responsible : null;
            const action = recommendAction({
                status,
                shiftComplianceOnly,
                hasAged,
                anomalies: driverAnomalies,
            });
            breakdown.sort((a, b) => b.ageHours - a.ageHours);
            const lead = units[0];
            drivers.push({
                driverId,
                driverName: lead?.driverName ?? null,
                branchId: lead?.branchId ?? null,
                totalCash: (0, driver_amount_map_1.getDriverAmountStr)(amountMap, driverId),
                driverScore: round2(driverScore),
                status,
                breakdown,
                lateCountLast7Days: lateCount,
                behaviorMultiplier,
                shiftDurationHours: shiftDurationH,
                shiftComplianceOnly,
                action,
                responsible,
            });
        }
        const anomalies = analysis.anomalies
            .filter((a) => isRealRiskAnomaly(a, analysis.flows))
            .map((a) => projectAnomaly(a, analysis.flows));
        const driversAtRisk = drivers.filter((d) => d.status === 'RISK' || d.status === 'CRITICAL').length;
        const systemStatus = classified.systemStatus;
        return {
            systemStatus,
            summary: {
                totalCash: (0, driver_amount_map_1.sumClassifiedKdLabel)(classified),
                totalDrivers: drivers.length,
                driversAtRisk,
                agedCash: kdToFixed4(agedCashKd),
                newCash: kdToFixed4(newCashKd),
            },
            drivers: drivers.sort((a, b) => b.driverScore - a.driverScore),
            anomalies,
            executionSummary: {
                gracePeriodHours: GRACE_PERIOD_HOURS,
                severityBands: SEVERITY_BANDS,
                amountTiers: { small: SMALL_TIER_KD, large: LARGE_TIER_KD },
                shiftOverdueCapHours: SHIFT_OVERDUE_CAP_HOURS,
                generatedAt: new Date().toISOString(),
            },
            readOnly: true,
            advisoryOnly: true,
        };
    }
};
exports.CashRiskService = CashRiskService;
exports.CashRiskService = CashRiskService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [cash_intelligence_v2_service_1.CashIntelligenceV2Service,
        cash_execution_tracker_service_1.CashExecutionTrackerService,
        cash_classifier_service_1.CashClassifierService])
], CashRiskService);
function parseAmount(s) {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
function kdToFixed4(n) {
    return n.toFixed(4);
}
function unitsMaxShiftHours(units) {
    let maxH = null;
    for (const u of units) {
        if (u.shiftStatus !== 'OPEN')
            continue;
        if (u.shiftDurationHours === null)
            continue;
        if (maxH === null || u.shiftDurationHours > maxH) {
            maxH = u.shiftDurationHours;
        }
    }
    return maxH;
}
function classifyStatus(score) {
    if (score >= SEVERITY_BANDS.critical)
        return 'CRITICAL';
    if (score >= SEVERITY_BANDS.risk)
        return 'RISK';
    if (score >= SEVERITY_BANDS.warning)
        return 'WARNING';
    return 'NORMAL';
}
function capAtWarning(s) {
    if (s === 'RISK' || s === 'CRITICAL')
        return 'WARNING';
    return s;
}
function isRealRiskAnomaly(a, flows) {
    if (!RISK_ANOMALY_TYPES.has(a.type))
        return false;
    const amountKd = parseAmount(a.amount);
    if (amountKd < ANOMALY_AMOUNT_FLOOR_KD)
        return false;
    const matchedHours = matchFlowAgeHours(a, flows);
    if (matchedHours < GRACE_PERIOD_HOURS)
        return false;
    return true;
}
function matchFlowAgeHours(a, flows) {
    const match = flows.find((f) => f.driverId === a.driverId &&
        f.amount === a.amount &&
        f.stage === a.stage);
    if (match)
        return match.ageHours;
    return Math.max(0, a.ageDays * 24);
}
function projectAnomaly(a, flows) {
    const match = flows.find((f) => f.driverId === a.driverId &&
        f.amount === a.amount &&
        f.stage === a.stage);
    return {
        type: a.type,
        driverId: a.driverId ?? '',
        driverName: match?.driverName ?? null,
        branchId: a.branchId ?? match?.branchId ?? null,
        amount: a.amount,
        ageDays: a.ageDays,
        ageHours: match?.ageHours ?? a.ageDays * 24,
        responsible: a.responsible,
        reason: a.reason,
    };
}
function recommendAction(input) {
    if (input.shiftComplianceOnly) {
        return 'CLOSE_SHIFT_COMPLIANCE';
    }
    if (input.status === 'CRITICAL') {
        return 'CONTACT_DRIVER_IMMEDIATELY';
    }
    if (input.status === 'RISK') {
        return 'FOLLOW_UP_TODAY';
    }
    if (input.status === 'WARNING') {
        return input.hasAged ? 'MONITOR_AGED_CASH' : 'MONITOR_SHIFT_DURATION';
    }
    return 'NO_ACTION';
}
function uniqueDriverIds(flows) {
    const set = new Set();
    for (const f of flows) {
        if (f.driverId)
            set.add(f.driverId);
    }
    return [...set];
}
//# sourceMappingURL=cash-risk.service.js.map