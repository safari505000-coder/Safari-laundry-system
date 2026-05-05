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
var CashExecutiveService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CashExecutiveService = void 0;
const common_1 = require("@nestjs/common");
const cash_monitor_service_1 = require("./cash-monitor.service");
const cash_decision_service_1 = require("./cash-decision.service");
const cash_execution_tracker_service_1 = require("./cash-execution-tracker.service");
const cash_exposure_service_1 = require("./cash-exposure.service");
const driver_amount_map_1 = require("./driver-amount-map");
const DECISION_NOTE = 'Actions are advisory only. No automatic enforcement.';
let CashExecutiveService = CashExecutiveService_1 = class CashExecutiveService {
    monitor;
    decisions;
    tracker;
    exposure;
    logger = new common_1.Logger(CashExecutiveService_1.name);
    constructor(monitor, decisions, tracker, exposure) {
        this.monitor = monitor;
        this.decisions = decisions;
        this.tracker = tracker;
        this.exposure = exposure;
    }
    async getExecutiveView() {
        const live = await this.monitor.getLive();
        const [operational, decisions, classified, exposure] = await Promise.all([
            this.monitor.getOperationalView(),
            this.decisions.getDecisions(),
            this.monitor.getClassified(),
            this.exposure.computeExposure(),
        ]);
        return await this.compose(live, operational, decisions, classified, exposure.silentAlerts);
    }
    async compose(live, operational, decisions, classified, silentAlerts) {
        const systemStatus = classified.systemStatus;
        const ssotTotalCash = (0, driver_amount_map_1.sumClassifiedKdLabel)(classified);
        const alertIndex = new Map();
        for (const a of operational.alerts) {
            const k = alertKey(a.type, a.driverId, a.timestamp);
            alertIndex.set(k, a);
        }
        const actions = decisions.actions.map((d) => {
            const op = alertIndex.get(alertKey(d.alertType, d.driverId, d.timestamp));
            const responsible = assignResponsibility(d.alertType, d.amount, op);
            return {
                driverName: d.driverName,
                action: d.action,
                urgency: d.urgency,
                responsible,
                amount: d.amount,
                alertType: d.alertType,
            };
        });
        let topRisk = projectTopRisk(decisions, actions);
        if (topRisk && topRisk.driverId) {
            const block = await this.tracker.getExecutionBlock(topRisk.driverId);
            topRisk = { ...topRisk, execution: block };
        }
        else if (topRisk) {
            topRisk = { ...topRisk, execution: null };
        }
        const totalAuditAlerts = live.preRisk.length + live.alerts.length;
        const response = {
            systemStatus,
            generatedAt: new Date().toISOString(),
            topRisk,
            actions,
            summary: {
                activeDrivers: operational.activeDrivers.length,
                driversAtRisk: operational.driversAtRisk.length,
                criticalAlerts: classified.financialAlerts.filter((a) => a.severity === 'CRITICAL').length,
                warningAlerts: classified.financialAlerts.filter((a) => a.severity === 'WARNING').length,
            },
            auditReference: {
                totalAlerts: totalAuditAlerts,
                hiddenStaleDrivers: operational.hidden.staleDriversCount,
                totalCashInFlight: ssotTotalCash,
                lastPollAt: live.lastPollAt,
            },
            decisionNote: DECISION_NOTE,
            silentAlerts,
            readOnly: true,
            advisoryOnly: true,
        };
        assertSsotConsistency({
            logger: this.logger,
            classified,
            ssotTotalCash,
            live,
            operational,
            executive: response,
        });
        return response;
    }
};
exports.CashExecutiveService = CashExecutiveService;
exports.CashExecutiveService = CashExecutiveService = CashExecutiveService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [cash_monitor_service_1.CashMonitorService,
        cash_decision_service_1.CashDecisionService,
        cash_execution_tracker_service_1.CashExecutionTrackerService,
        cash_exposure_service_1.CashExposureService])
], CashExecutiveService);
function assertSsotConsistency(input) {
    const { logger, classified, ssotTotalCash, live, operational, executive } = input;
    const expectedStatus = classified.systemStatus;
    const drifts = [];
    if (live.realtimeStatus !== expectedStatus) {
        drifts.push({
            layer: 'live.realtimeStatus',
            observed: live.realtimeStatus,
        });
    }
    if (operational.realtimeStatus !== expectedStatus) {
        drifts.push({
            layer: 'operational.realtimeStatus',
            observed: operational.realtimeStatus,
        });
    }
    if (executive.systemStatus !== expectedStatus) {
        drifts.push({
            layer: 'executive.systemStatus',
            observed: executive.systemStatus,
        });
    }
    if (live.summary.totalCash !== ssotTotalCash) {
        drifts.push({
            layer: 'live.summary.totalCash',
            observed: live.summary.totalCash,
        });
    }
    if (operational.summary.totalCash !== ssotTotalCash) {
        drifts.push({
            layer: 'operational.summary.totalCash',
            observed: operational.summary.totalCash,
        });
    }
    if (executive.auditReference.totalCashInFlight !== ssotTotalCash) {
        drifts.push({
            layer: 'executive.auditReference.totalCashInFlight',
            observed: executive.auditReference.totalCashInFlight,
        });
    }
    if (drifts.length === 0)
        return;
    const detail = drifts.map((d) => `${d.layer}=${d.observed}`).join(', ');
    const msg = `SSoT VIOLATION: CASH DRIFT DETECTED — classifier=${expectedStatus} (Σamount=${ssotTotalCash}) but ${detail}. The classifier is the ONLY sanctioned source of systemStatus and per-driver cash.`;
    logger.error(msg);
    if (process.env.NODE_ENV !== 'production') {
        throw new Error(msg);
    }
    console.error('SSoT DRIFT', {
        expectedStatus,
        ssotTotalCash,
        drifts,
    });
}
function assignResponsibility(alertType, amount, op) {
    const exposure = parseFloat(amount) || 0;
    if (exposure <= 0)
        return null;
    if (alertType === 'PRE_SHIFT_OVERDUE' ||
        alertType === 'HIGH_DRIVER_EXPOSURE' ||
        alertType === 'SHIFT_COMPLIANCE_DELAY') {
        return null;
    }
    switch (alertType) {
        case 'SHIFT_OVERDUE_FINANCIAL':
        case 'STUCK_AT_DRIVER':
            return 'DRIVER';
        case 'HANDOVER_DELAY':
        case 'CUSTODY_DELAY':
            return 'BRANCH_MANAGER';
        case 'DEPOSIT_NOT_REGISTERED':
        case 'DEPOSIT_AMOUNT_MISMATCH':
        case 'OVERPAYMENT_ANOMALY':
            return 'ACCOUNTANT';
        case 'DOUBLE_COUNT_RISK':
            return 'SYSTEM';
        default:
            return null;
    }
}
function projectTopRisk(decisions, projected) {
    const top = decisions.topRisk;
    if (!top)
        return null;
    const projectedTop = projected[0];
    return {
        driverId: top.driverId,
        driverName: top.driverName,
        branchId: top.branchId,
        amount: top.amount,
        issue: top.issue,
        action: top.action,
        urgency: top.urgency,
        responsible: projectedTop?.responsible ?? null,
        recommendedSteps: top.recommendedSteps,
        alertType: top.alertType,
        execution: null,
    };
}
function alertKey(type, driverId, timestamp) {
    return `${type}::${driverId ?? '_'}::${timestamp}`;
}
//# sourceMappingURL=cash-executive.service.js.map