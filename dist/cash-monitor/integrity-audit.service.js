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
exports.IntegrityAuditService = void 0;
const common_1 = require("@nestjs/common");
const cash_monitor_service_1 = require("./cash-monitor.service");
const cash_decision_service_1 = require("./cash-decision.service");
const cash_executive_service_1 = require("./cash-executive.service");
const cash_risk_service_1 = require("./cash-risk.service");
const ANOMALY_AMOUNT_FLOOR_KD = 5;
const ANOMALY_AGE_GATE_HOURS = 24;
const TOTAL_CASH_TOLERANCE_KD = 0.0001;
let IntegrityAuditService = class IntegrityAuditService {
    monitor;
    decisions;
    executive;
    risk;
    constructor(monitor, decisions, executive, risk) {
        this.monitor = monitor;
        this.decisions = decisions;
        this.executive = executive;
        this.risk = risk;
    }
    async run() {
        const live = await this.monitor.getLive();
        const [operational, decisions, classified, executive, risk] = await Promise.all([
            this.monitor.getOperationalView(),
            this.decisions.getDecisions(),
            this.monitor.getClassified(),
            this.executive.getExecutiveView(),
            this.risk.computeRisk(),
        ]);
        const critical = [];
        const warnings = [];
        checkStatusConsistency({
            classified,
            risk,
            executive,
            live,
            operational,
            out: critical,
        });
        checkSeverityCounts({ classified, executive, out: critical });
        checkTopRiskConsistency({ classified, executive, out: critical });
        checkClassifierThresholds({ classified, out: critical });
        checkRiskAnomalyThresholds({ risk, out: critical });
        checkDriverReconciliation({ classified, risk, out: warnings });
        checkTotalCashReconciliation({
            classified,
            live,
            out: warnings,
        });
        checkAlertEdgeCases({ classified, executive, out: warnings });
        const status = critical.length === 0 ? 'PASS' : 'FAIL';
        return {
            status,
            blocked: critical.length > 0,
            criticalIssues: critical,
            warnings,
            summary: {
                driversChecked: classified.drivers.length,
                alertsChecked: classified.financialAlerts.length +
                    classified.complianceAlerts.length,
                layersChecked: 5,
                mismatches: critical.length,
                warnings: warnings.length,
                generatedAt: new Date().toISOString(),
            },
            readOnly: true,
        };
    }
};
exports.IntegrityAuditService = IntegrityAuditService;
exports.IntegrityAuditService = IntegrityAuditService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [cash_monitor_service_1.CashMonitorService,
        cash_decision_service_1.CashDecisionService,
        cash_executive_service_1.CashExecutiveService,
        cash_risk_service_1.CashRiskService])
], IntegrityAuditService);
function checkStatusConsistency(input) {
    const truth = input.classified.systemStatus;
    pushStatusMismatch(truth, input.risk.systemStatus, '/classified', '/risk', input.out);
    pushStatusMismatch(truth, input.executive.systemStatus, '/classified', '/executive', input.out);
    pushStatusMismatch(truth, input.live.realtimeStatus, '/classified', '/live', input.out);
    pushStatusMismatch(truth, input.operational.realtimeStatus, '/classified', '/operational', input.out);
}
function pushStatusMismatch(truth, observed, sourceA, sourceB, out) {
    if (truth === observed)
        return;
    out.push({
        type: 'STATUS_DRIFT',
        severity: 'CRITICAL',
        driverId: null,
        driverName: null,
        expected: truth,
        found: observed,
        sourceA,
        sourceB,
        delta: null,
        message: `${sourceB}.systemStatus (${observed}) drifts from the classifier truth (${truth}).`,
    });
}
function checkSeverityCounts(input) {
    const expectedCritical = input.classified.financialAlerts.filter((a) => a.severity === 'CRITICAL').length;
    const expectedWarning = input.classified.financialAlerts.filter((a) => a.severity === 'WARNING').length;
    if (input.executive.summary.criticalAlerts !== expectedCritical) {
        input.out.push({
            type: 'CRITICAL_COUNT_MISMATCH',
            severity: 'CRITICAL',
            driverId: null,
            driverName: null,
            expected: String(expectedCritical),
            found: String(input.executive.summary.criticalAlerts),
            sourceA: '/classified',
            sourceB: '/executive.summary.criticalAlerts',
            delta: String(input.executive.summary.criticalAlerts - expectedCritical),
            message: `Executive critical-alert count (${input.executive.summary.criticalAlerts}) drifts from /classified (${expectedCritical}).`,
        });
    }
    if (input.executive.summary.warningAlerts !== expectedWarning) {
        input.out.push({
            type: 'WARNING_COUNT_MISMATCH',
            severity: 'CRITICAL',
            driverId: null,
            driverName: null,
            expected: String(expectedWarning),
            found: String(input.executive.summary.warningAlerts),
            sourceA: '/classified',
            sourceB: '/executive.summary.warningAlerts',
            delta: String(input.executive.summary.warningAlerts - expectedWarning),
            message: `Executive warning-alert count (${input.executive.summary.warningAlerts}) drifts from /classified (${expectedWarning}).`,
        });
    }
}
function checkTopRiskConsistency(input) {
    const noFinancial = input.classified.financialAlerts.length === 0;
    const top = input.executive.topRisk;
    if (noFinancial && top !== null) {
        input.out.push({
            type: 'TOPRISK_INCONSISTENCY',
            severity: 'CRITICAL',
            driverId: top.driverId,
            driverName: top.driverName,
            expected: 'null',
            found: top.alertType ?? 'topRisk',
            sourceA: '/classified.financialAlerts (empty)',
            sourceB: '/executive.topRisk',
            delta: null,
            message: `Executive topRisk surfaced (${top.alertType}) but /classified has zero financial alerts.`,
        });
    }
    if (top && top.driverId) {
        const inClassified = input.classified.financialAlerts.some((a) => a.driverId === top.driverId);
        if (!inClassified) {
            input.out.push({
                type: 'TOPRISK_DRIVER_NOT_IN_CLASSIFIED',
                severity: 'CRITICAL',
                driverId: top.driverId,
                driverName: top.driverName,
                expected: 'driverId present in /classified.financialAlerts',
                found: 'absent',
                sourceA: '/classified.financialAlerts',
                sourceB: '/executive.topRisk',
                delta: null,
                message: `Executive topRisk references driver ${top.driverId} but no matching financial alert exists in /classified.`,
            });
        }
    }
}
function checkClassifierThresholds(input) {
    for (const a of input.classified.financialAlerts) {
        const amountKd = Number.parseFloat(a.amount) || 0;
        if (amountKd < ANOMALY_AMOUNT_FLOOR_KD) {
            input.out.push({
                type: 'AMOUNT_FLOOR_VIOLATION',
                severity: 'CRITICAL',
                driverId: a.driverId,
                driverName: a.driverName,
                expected: `amount >= ${ANOMALY_AMOUNT_FLOOR_KD} KD`,
                found: a.amount,
                sourceA: '/classified.financialAlerts',
                sourceB: null,
                delta: (amountKd - ANOMALY_AMOUNT_FLOOR_KD).toFixed(4),
                message: `Financial alert with amount ${a.amount} KD breaches the ${ANOMALY_AMOUNT_FLOOR_KD} KD floor (type=${a.type}).`,
            });
        }
        if (a.cashAgeHours < ANOMALY_AGE_GATE_HOURS) {
            input.out.push({
                type: 'AGE_GATE_VIOLATION',
                severity: 'CRITICAL',
                driverId: a.driverId,
                driverName: a.driverName,
                expected: `cashAgeHours >= ${ANOMALY_AGE_GATE_HOURS}`,
                found: String(a.cashAgeHours),
                sourceA: '/classified.financialAlerts',
                sourceB: null,
                delta: (a.cashAgeHours - ANOMALY_AGE_GATE_HOURS).toFixed(2),
                message: `Financial alert with age ${a.cashAgeHours}h breaches the 24h grace gate (type=${a.type}).`,
            });
        }
    }
}
function checkRiskAnomalyThresholds(input) {
    for (const a of input.risk.anomalies) {
        const amountKd = Number.parseFloat(a.amount) || 0;
        if (amountKd < ANOMALY_AMOUNT_FLOOR_KD) {
            input.out.push({
                type: 'AMOUNT_FLOOR_VIOLATION',
                severity: 'CRITICAL',
                driverId: a.driverId,
                driverName: a.driverName,
                expected: `amount >= ${ANOMALY_AMOUNT_FLOOR_KD} KD`,
                found: a.amount,
                sourceA: '/risk.anomalies',
                sourceB: null,
                delta: (amountKd - ANOMALY_AMOUNT_FLOOR_KD).toFixed(4),
                message: `Risk anomaly with amount ${a.amount} KD breaches the ${ANOMALY_AMOUNT_FLOOR_KD} KD floor (type=${a.type}).`,
            });
        }
        if (a.ageHours < ANOMALY_AGE_GATE_HOURS) {
            input.out.push({
                type: 'AGE_GATE_VIOLATION',
                severity: 'CRITICAL',
                driverId: a.driverId,
                driverName: a.driverName,
                expected: `ageHours >= ${ANOMALY_AGE_GATE_HOURS}`,
                found: String(a.ageHours),
                sourceA: '/risk.anomalies',
                sourceB: null,
                delta: (a.ageHours - ANOMALY_AGE_GATE_HOURS).toFixed(2),
                message: `Risk anomaly with age ${a.ageHours}h breaches the 24h grace gate (type=${a.type}).`,
            });
        }
    }
}
function checkDriverReconciliation(input) {
    const classifiedById = new Map(input.classified.drivers.map((d) => [d.driverId, d]));
    const riskById = new Map(input.risk.drivers.map((d) => [d.driverId, d]));
    for (const [driverId, cd] of classifiedById) {
        const rd = riskById.get(driverId);
        if (!rd) {
            input.out.push({
                type: 'DRIVER_LAYER_MISMATCH',
                severity: 'WARNING',
                driverId,
                driverName: cd.driverName,
                expected: 'present in /risk.drivers',
                found: 'absent',
                sourceA: '/classified.drivers',
                sourceB: '/risk.drivers',
                delta: null,
                message: `Driver ${cd.driverName ?? driverId} appears in /classified but not in /risk.`,
            });
            continue;
        }
        const cAmount = Number.parseFloat(cd.amount) || 0;
        const rAmount = Number.parseFloat(rd.totalCash) || 0;
        const delta = Math.abs(cAmount - rAmount);
        if (delta > TOTAL_CASH_TOLERANCE_KD) {
            input.out.push({
                type: 'DRIVER_AMOUNT_MISMATCH',
                severity: 'WARNING',
                driverId,
                driverName: cd.driverName ?? rd.driverName,
                expected: cd.amount,
                found: rd.totalCash,
                sourceA: '/classified.drivers',
                sourceB: '/risk.drivers',
                delta: delta.toFixed(4),
                message: `Driver ${cd.driverName ?? driverId} reports ${cd.amount} KD on /classified but ${rd.totalCash} KD on /risk (delta ${delta.toFixed(4)} KD).`,
            });
        }
    }
    for (const [driverId, rd] of riskById) {
        if (!classifiedById.has(driverId)) {
            input.out.push({
                type: 'DRIVER_LAYER_MISMATCH',
                severity: 'WARNING',
                driverId,
                driverName: rd.driverName,
                expected: 'present in /classified.drivers',
                found: 'absent',
                sourceA: '/risk.drivers',
                sourceB: '/classified.drivers',
                delta: null,
                message: `Driver ${rd.driverName ?? driverId} appears in /risk but not in /classified.`,
            });
        }
    }
}
function checkTotalCashReconciliation(input) {
    const classifiedSum = input.classified.drivers.reduce((s, d) => s + (Number.parseFloat(d.amount) || 0), 0);
    const liveTotal = Number.parseFloat(input.live.summary.totalCash) || 0;
    const delta = Math.abs(classifiedSum - liveTotal);
    if (delta > TOTAL_CASH_TOLERANCE_KD) {
        input.out.push({
            type: 'TOTAL_CASH_DRIFT',
            severity: 'WARNING',
            driverId: null,
            driverName: null,
            expected: classifiedSum.toFixed(4),
            found: liveTotal.toFixed(4),
            sourceA: '/classified (sum of drivers)',
            sourceB: '/live.summary.totalCash',
            delta: delta.toFixed(4),
            message: `Total cash drifts: /classified sums to ${classifiedSum.toFixed(4)} KD but /live reports ${liveTotal.toFixed(4)} KD (delta ${delta.toFixed(4)} KD).`,
        });
    }
}
function checkAlertEdgeCases(input) {
    for (const a of input.classified.financialAlerts) {
        if (!a.driverId) {
            input.out.push({
                type: 'ALERT_WITHOUT_DRIVER',
                severity: 'WARNING',
                driverId: null,
                driverName: a.driverName,
                expected: 'driverId attached',
                found: 'null',
                sourceA: '/classified.financialAlerts',
                sourceB: null,
                delta: null,
                message: `Financial alert (type=${a.type}, amount=${a.amount} KD) has no driverId — cannot be assigned for follow-up.`,
            });
        }
    }
    for (const a of input.classified.complianceAlerts) {
        if (!a.driverId) {
            input.out.push({
                type: 'ALERT_WITHOUT_DRIVER',
                severity: 'WARNING',
                driverId: null,
                driverName: a.driverName,
                expected: 'driverId attached',
                found: 'null',
                sourceA: '/classified.complianceAlerts',
                sourceB: null,
                delta: null,
                message: `Compliance alert (type=${a.type}) has no driverId — operator cannot follow up.`,
            });
        }
    }
    void input.executive;
}
//# sourceMappingURL=integrity-audit.service.js.map