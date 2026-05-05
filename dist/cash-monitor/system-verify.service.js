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
exports.SystemVerifyService = void 0;
const common_1 = require("@nestjs/common");
const cash_classifier_service_1 = require("./cash-classifier.service");
const cash_risk_service_1 = require("./cash-risk.service");
const cash_executive_service_1 = require("./cash-executive.service");
let SystemVerifyService = class SystemVerifyService {
    classifier;
    risk;
    executive;
    constructor(classifier, risk, executive) {
        this.classifier = classifier;
        this.risk = risk;
        this.executive = executive;
    }
    async run() {
        const scenarios = [
            {
                name: 'A_small_young_cash',
                label: 'A — 3 KD on driver, 2 hours old',
                expected: 'GREEN',
                expectFinancialAlerts: 'NONE',
                build: () => buildSmallYoungScenario(),
            },
            {
                name: 'B_large_aged_cash',
                label: 'B — 600 KD on driver, 50 hours old',
                expected: 'RED',
                expectFinancialAlerts: 'AT_LEAST_ONE_CRITICAL',
                build: () => buildLargeAgedScenario(),
            },
        ];
        const checks = [];
        const mismatches = [];
        for (const s of scenarios) {
            const analysis = s.build();
            const classified = this.classifier.composeFromAnalysis(analysis);
            const risk = this.risk.composeFromAnalysis(analysis, classified, new Map());
            const synthTotal = classified.drivers
                .reduce((s, d) => s + Number(d.amount), 0)
                .toFixed(4);
            const live = buildEmptyLiveSnapshot(classified.systemStatus, synthTotal);
            const operational = buildEmptyOperationalSnapshot(classified.systemStatus, synthTotal);
            const decisions = buildEmptyDecisionsSnapshot(classified.systemStatus);
            const executive = await this.executive.compose(live, operational, decisions, classified, null);
            const ok = classified.systemStatus === s.expected &&
                risk.systemStatus === classified.systemStatus &&
                executive.systemStatus === classified.systemStatus &&
                verifyFinancialAlerts(s.expectFinancialAlerts, classified);
            if (classified.systemStatus !== s.expected) {
                mismatches.push(`${s.label}: expected systemStatus=${s.expected}, got ${classified.systemStatus}`);
            }
            if (risk.systemStatus !== classified.systemStatus) {
                mismatches.push(`${s.label}: /risk.systemStatus (${risk.systemStatus}) drifts from /classified (${classified.systemStatus})`);
            }
            if (executive.systemStatus !== classified.systemStatus) {
                mismatches.push(`${s.label}: /executive.systemStatus (${executive.systemStatus}) drifts from /classified (${classified.systemStatus})`);
            }
            if (!verifyFinancialAlerts(s.expectFinancialAlerts, classified)) {
                const got = classified.financialAlerts.length;
                const expectedDescription = s.expectFinancialAlerts === 'NONE'
                    ? '0 financial alerts'
                    : 'at least 1 CRITICAL financial alert';
                mismatches.push(`${s.label}: expected ${expectedDescription}, got ${got} (severities: ${classified.financialAlerts.map((a) => a.severity).join(', ') || 'none'})`);
            }
            checks.push({
                scenario: s.label,
                expected: s.expected,
                classified: classified.systemStatus,
                risk: risk.systemStatus,
                executive: executive.systemStatus,
                financialAlerts: classified.financialAlerts.length,
                complianceAlerts: classified.complianceAlerts.length,
                ok,
            });
        }
        const status = mismatches.length === 0 ? 'PASS' : 'FAIL';
        return {
            status,
            blocked: mismatches.length > 0,
            checks,
            mismatches,
            generatedAt: new Date().toISOString(),
            readOnly: true,
        };
    }
};
exports.SystemVerifyService = SystemVerifyService;
exports.SystemVerifyService = SystemVerifyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [cash_classifier_service_1.CashClassifierService,
        cash_risk_service_1.CashRiskService,
        cash_executive_service_1.CashExecutiveService])
], SystemVerifyService);
function verifyFinancialAlerts(expectation, classified) {
    if (expectation === 'NONE') {
        return classified.financialAlerts.length === 0;
    }
    return classified.financialAlerts.some((a) => a.severity === 'CRITICAL');
}
const SYNTH_DRIVER_ID = '00000000-0000-0000-0000-000000000001';
const SYNTH_BRANCH_ID = '00000000-0000-0000-0000-000000000010';
function buildSmallYoungScenario() {
    const flow = {
        driverId: SYNTH_DRIVER_ID,
        driverName: 'SYNTH_DRIVER',
        branchId: SYNTH_BRANCH_ID,
        amount: '3.0000',
        amountTier: 'SMALL',
        originDate: kuwaitDayIso(),
        ageDays: 0,
        ageHours: 2,
        stage: 'DRIVER',
        driverGate: 'ACTIVE_FLOW',
        shiftStatus: 'OPEN',
        shiftDurationHours: 2,
        ignoredNonOperational: false,
        contextReason: 'synthetic verify scenario A',
    };
    return analysisFromFlows({ flows: [flow], anomalies: [] });
}
function buildLargeAgedScenario() {
    const flow = {
        driverId: SYNTH_DRIVER_ID,
        driverName: 'SYNTH_DRIVER',
        branchId: SYNTH_BRANCH_ID,
        amount: '600.0000',
        amountTier: 'LARGE',
        originDate: kuwaitDayIso(-2),
        ageDays: 2,
        ageHours: 50,
        stage: 'DRIVER',
        driverGate: 'ACTIVE_FLOW',
        shiftStatus: 'OPEN',
        shiftDurationHours: 50,
        ignoredNonOperational: false,
        contextReason: 'synthetic verify scenario B',
    };
    const anomaly = {
        type: 'STUCK_AT_DRIVER',
        severity: 'CRITICAL',
        amount: '600.0000',
        amountTier: 'LARGE',
        ageDays: 2,
        stage: 'DRIVER',
        responsible: 'DRIVER',
        driverId: SYNTH_DRIVER_ID,
        branchId: SYNTH_BRANCH_ID,
        reason: '600 KD stuck on driver for 50h.',
        actionLocked: false,
        requiresManualReview: true,
    };
    return analysisFromFlows({ flows: [flow], anomalies: [anomaly] });
}
function analysisFromFlows(input) {
    const totalCash = input.flows
        .reduce((s, f) => s + Number(f.amount), 0)
        .toFixed(4);
    return {
        executionSummary: {
            dataFetched: ['synthetic'],
            logicApplied: ['synthetic'],
            ignoredCases: [],
            assumptions: ['SystemVerifyService synthesised this analysis'],
            toleranceKd: '0.0100',
            shiftOverdueCapHours: 16,
            asOfDate: kuwaitDayIso(),
            generatedAt: new Date().toISOString(),
        },
        systemHealth: 'OK',
        summary: {
            totalCash,
            newCash: totalCash,
            agedCash: '0.0000',
            issues: input.anomalies.length,
        },
        locationSummary: { DRIVER: totalCash, CUSTODY: '0.0000', BANK: '0.0000' },
        flows: input.flows,
        anomalies: input.anomalies,
        finalAssessment: 'synthetic verification analysis',
        readOnly: true,
        advisoryOnly: true,
    };
}
function buildEmptyLiveSnapshot(systemStatus, totalCash) {
    const ts = new Date().toISOString();
    return {
        timestamp: ts,
        lastPollAt: ts,
        lastPollAgeSeconds: 0,
        realtimeStatus: systemStatus,
        activeDrivers: 0,
        preRisk: [],
        alerts: [],
        driversAtRisk: [],
        locationSummary: { DRIVER: totalCash, CUSTODY: '0.0000', BANK: '0.0000' },
        summary: {
            totalCash,
            driversAtRisk: 0,
            activeAnomalies: 0,
            openShifts: 0,
        },
        readOnly: true,
        advisoryOnly: true,
    };
}
function buildEmptyOperationalSnapshot(systemStatus, totalCash) {
    return {
        timestamp: new Date().toISOString(),
        realtimeStatus: systemStatus,
        activeDrivers: [],
        driversAtRisk: [],
        alerts: [],
        hidden: { staleDriversCount: 0, excludedAlertCount: 0, note: 'synthetic' },
        summary: {
            totalDriversShown: 0,
            totalCash,
            driversAtRisk: 0,
            activeAlerts: 0,
        },
        readOnly: true,
        advisoryOnly: true,
    };
}
function buildEmptyDecisionsSnapshot(systemStatus) {
    return {
        timestamp: new Date().toISOString(),
        realtimeStatus: systemStatus,
        topRisk: null,
        actions: [],
        summary: { critical: 0, warning: 0, info: 0, totalActions: 0 },
        readOnly: true,
        advisoryOnly: true,
    };
}
function kuwaitDayIso(offsetDays = 0) {
    const KUWAIT_OFFSET_MIN = 180;
    const DAY_MS = 86_400_000;
    const local = new Date(Date.now() + KUWAIT_OFFSET_MIN * 60_000 + offsetDays * DAY_MS);
    return local.toISOString().slice(0, 10);
}
//# sourceMappingURL=system-verify.service.js.map