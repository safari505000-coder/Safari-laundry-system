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
var CashDashboardService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CashDashboardService = void 0;
const common_1 = require("@nestjs/common");
const cash_classifier_service_1 = require("./cash-classifier.service");
const cash_executive_service_1 = require("./cash-executive.service");
const driver_amount_map_1 = require("./driver-amount-map");
const branch_cash_ledger_service_1 = require("./branch-cash-ledger.service");
const SUMMARY_TEXT = {
    GREEN: 'مستقر',
    YELLOW: 'انتباه تشغيلي',
    RED: 'خطر مالي',
};
const KD_ZERO = '0.0000';
let CashDashboardService = CashDashboardService_1 = class CashDashboardService {
    classifier;
    executive;
    branchLedger;
    logger = new common_1.Logger(CashDashboardService_1.name);
    constructor(classifier, executive, branchLedger) {
        this.classifier = classifier;
        this.executive = executive;
        this.branchLedger = branchLedger;
    }
    async getDashboard() {
        const classified = await this.classifier.classify();
        const [executive, branchLedger] = await Promise.all([
            this.executive.getExecutiveView(),
            this.branchLedger.project(),
        ]);
        return this.compose(classified, executive, branchLedger);
    }
    compose(classified, executive, branchLedger) {
        assertSystemStatusAligned(this.logger, classified, executive);
        const totalCash = (0, driver_amount_map_1.sumClassifiedKdLabel)(classified);
        const drivers = classified.drivers.map(projectDriver);
        const branches = projectBranchSummary(branchLedger);
        const response = {
            systemStatus: classified.systemStatus,
            totalCash,
            summaryText: SUMMARY_TEXT[classified.systemStatus],
            alerts: {
                financial: classified.financialAlerts,
                compliance: classified.complianceAlerts,
            },
            drivers,
            branches,
            topRisk: executive.topRisk,
            generatedAt: new Date().toISOString(),
            readOnly: true,
            advisoryOnly: true,
        };
        assertBranchSliceAligned(this.logger, response.branches);
        assertResponseTotalAligned(this.logger, response, totalCash);
        assertScenarioContract(this.logger, classified);
        return response;
    }
};
exports.CashDashboardService = CashDashboardService;
exports.CashDashboardService = CashDashboardService = CashDashboardService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [cash_classifier_service_1.CashClassifierService,
        cash_executive_service_1.CashExecutiveService,
        branch_cash_ledger_service_1.BranchCashLedgerService])
], CashDashboardService);
function projectDriver(d) {
    return {
        driverId: d.driverId,
        name: d.driverName ?? d.driverId,
        totalCash: d.amount || KD_ZERO,
        status: d.status,
        oldestAgeHours: d.cashAgeHours,
    };
}
function assertSystemStatusAligned(logger, classified, executive) {
    if (classified.systemStatus === executive.systemStatus)
        return;
    const msg = `SSoT VIOLATION: cross-layer status drift on /dashboard — classifier=${classified.systemStatus}, executive=${executive.systemStatus}.`;
    logger.error(msg);
    if (process.env.NODE_ENV !== 'production') {
        throw new Error(msg);
    }
}
function assertResponseTotalAligned(logger, response, ssotTotalCash) {
    if (response.totalCash === ssotTotalCash)
        return;
    const msg = `SSoT VIOLATION: dashboard.totalCash=${response.totalCash} drifts from Σ classified.drivers[].amount=${ssotTotalCash}.`;
    logger.error(msg);
    if (process.env.NODE_ENV !== 'production') {
        throw new Error(msg);
    }
}
function assertScenarioContract(logger, classified) {
    const FLOOR_KD = classified.rules?.smallAmountFloorKd ?? 5;
    const GRACE_HOURS = classified.rules?.gracePeriodHours ?? 24;
    const violations = [];
    for (const a of classified.financialAlerts) {
        const amountKd = parseAmount(a.amount);
        if (amountKd < FLOOR_KD) {
            violations.push(`financial alert ${a.type} (${a.amount} KD) below ${FLOOR_KD} KD floor`);
        }
        if (a.cashAgeHours < GRACE_HOURS) {
            violations.push(`financial alert ${a.type} (age ${a.cashAgeHours}h) inside ${GRACE_HOURS}h grace`);
        }
    }
    if (classified.systemStatus === 'RED' &&
        !classified.financialAlerts.some((a) => a.severity === 'CRITICAL')) {
        violations.push('systemStatus=RED but no CRITICAL financial alert (RED must be money-driven)');
    }
    if (violations.length === 0)
        return;
    const msg = `SSoT VIOLATION: dashboard scenario contract failed → ${violations.join('; ')}`;
    logger.error(msg);
    if (process.env.NODE_ENV !== 'production') {
        throw new Error(msg);
    }
}
function parseAmount(s) {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
}
function projectBranchSummary(ledger) {
    const rows = ledger.branches.map((b) => ({
        branchId: b.branchId,
        name: b.branchName || b.branchId,
        currentBranchCash: b.currentBranchCash,
        openBagCount: b.openBagCount,
    }));
    return {
        rows,
        totalCurrentBranchCash: ledger.totalCurrentBranchCash,
        unattributedCustodyKd: ledger.unattributedCustodyKd,
        unattributedCustodyBagCount: ledger.unattributedCustodyBagCount,
    };
}
function assertBranchSliceAligned(logger, branches) {
    const reSum = sumFixed4(branches.rows.map((r) => r.currentBranchCash));
    if (reSum === branches.totalCurrentBranchCash)
        return;
    const msg = `SSoT VIOLATION: branches.totalCurrentBranchCash=${branches.totalCurrentBranchCash} drifts from Σ rows[].currentBranchCash=${reSum}.`;
    logger.error(msg);
    if (process.env.NODE_ENV !== 'production') {
        throw new Error(msg);
    }
}
function sumFixed4(values) {
    let total = 0n;
    for (const v of values) {
        const trimmed = (v ?? '0').trim();
        const sign = trimmed.startsWith('-') ? -1n : 1n;
        const clean = trimmed.replace(/^-/, '');
        const [whole, frac = ''] = clean.split('.');
        const frac4 = `${frac}0000`.slice(0, 4);
        total += sign * (BigInt(whole || '0') * 10000n + BigInt(frac4));
    }
    const sign = total < 0n ? '-' : '';
    const abs = total < 0n ? -total : total;
    const whole = abs / 10000n;
    const frac = (abs % 10000n).toString().padStart(4, '0');
    return `${sign}${whole}.${frac}`;
}
//# sourceMappingURL=cash-dashboard.service.js.map