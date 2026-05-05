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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var CashSafetyAuditCron_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CashSafetyAuditCron = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const driver_amount_map_1 = require("./driver-amount-map");
const cash_classifier_service_1 = require("./cash-classifier.service");
const driver_amount_audit_service_1 = require("./driver-amount-audit.service");
const integrity_audit_service_1 = require("./integrity-audit.service");
const system_verify_service_1 = require("./system-verify.service");
const branch_cash_ledger_service_1 = require("./branch-cash-ledger.service");
const role_consistency_service_1 = require("./role-consistency.service");
const ledger_projection_service_1 = require("../finance/ledger/ledger-projection.service");
const cash_intelligence_v2_service_1 = require("../cash-intelligence/cash-intelligence-v2.service");
const money_util_1 = require("../cash-intelligence/engines/money.util");
const owner_alert_notifier_service_1 = require("../system-guardian/owner-alert-notifier.service");
const AGE_WARNING_HOURS = 24;
const AGE_CRITICAL_HOURS = 48;
const AGE_BLOCK_HOURS = 72;
const BRANCH_DRIFT_TOLERANCE_MINOR = 1n;
let CashSafetyAuditCron = CashSafetyAuditCron_1 = class CashSafetyAuditCron {
    classifier;
    verify;
    integrity;
    driverAmountAudit;
    branchLedger;
    v2;
    roleConsistency;
    ledger;
    notifier;
    logger = new common_1.Logger(CashSafetyAuditCron_1.name);
    lastAlertedSeverity = 'OK';
    constructor(classifier, verify, integrity, driverAmountAudit, branchLedger, v2, roleConsistency, ledger, notifier) {
        this.classifier = classifier;
        this.verify = verify;
        this.integrity = integrity;
        this.driverAmountAudit = driverAmountAudit;
        this.branchLedger = branchLedger;
        this.v2 = v2;
        this.roleConsistency = roleConsistency;
        this.ledger = ledger;
        this.notifier = notifier;
    }
    async sweep() {
        try {
            const report = await this.runOnce();
            await this.publish(report);
        }
        catch (e) {
            this.logger.error(JSON.stringify({
                event: 'cash_safety_audit_failed',
                message: e instanceof Error ? e.message : String(e),
            }));
        }
    }
    async runOnce() {
        const classified = await this.classifier.classify();
        const ssotTotalCash = (0, driver_amount_map_1.sumClassifiedKdLabel)(classified);
        let oldestAge = 0;
        let ageDriverId = null;
        let ageDriverName = null;
        for (const d of classified.drivers) {
            if (d.cashAgeHours > oldestAge) {
                oldestAge = d.cashAgeHours;
                ageDriverId = d.driverId;
                ageDriverName = d.driverName ?? null;
            }
        }
        const ageSeverity = oldestAge >= AGE_BLOCK_HOURS
            ? 'BLOCK'
            : oldestAge >= AGE_CRITICAL_HOURS
                ? 'CRITICAL'
                : oldestAge >= AGE_WARNING_HOURS
                    ? 'WARNING'
                    : 'OK';
        const [verifyResult, integrityResult, driverResult, branchDrift, roleResult, ledgerInvariant,] = await Promise.all([
            this.verify.run().catch((e) => ({
                status: 'ERROR',
                error: e instanceof Error ? e.message : String(e),
            })),
            this.integrity.run().catch((e) => ({
                status: 'ERROR',
                error: e instanceof Error ? e.message : String(e),
            })),
            this.driverAmountAudit.run().catch((e) => ({
                status: 'ERROR',
                error: e instanceof Error ? e.message : String(e),
            })),
            this.runBranchDriftCheck().catch((e) => ({
                status: 'ERROR',
                driftKd: '0.0000',
                ledgerTotalKd: '0.0000',
                v2CustodyKd: '0.0000',
                unattributedCustodyKd: '0.0000',
                error: e instanceof Error ? e.message : String(e),
            })),
            this.roleConsistency.run().catch((e) => ({
                status: 'ERROR',
                totalActiveUsers: 0,
                mismatches: [],
                error: e instanceof Error ? e.message : String(e),
            })),
            this.runLedgerInvariantCheck().catch((e) => ({
                status: 'ERROR',
                unbalancedCount: 0,
                globalDebit: '0.0000',
                globalCredit: '0.0000',
                error: e instanceof Error ? e.message : String(e),
            })),
        ]);
        const issues = [];
        if (verifyResult.status !== 'PASS') {
            issues.push(`verify=${verifyResult.status}`);
        }
        if (integrityResult.status !== 'PASS') {
            const detail = 'summary' in integrityResult && integrityResult.summary
                ? ` (${integrityResult.summary.mismatches} mismatches)`
                : '';
            issues.push(`integrity=${integrityResult.status}${detail}`);
        }
        if (driverResult.status !== 'PASS') {
            const detail = 'mismatches' in driverResult && Array.isArray(driverResult.mismatches)
                ? ` (${driverResult.mismatches.length} drivers)`
                : '';
            issues.push(`driverAmount=${driverResult.status}${detail}`);
        }
        if (branchDrift.status !== 'PASS') {
            issues.push(`CASH DRIFT DETECTED: branchLedger=${branchDrift.ledgerTotalKd} KD vs v2.CUSTODY=${branchDrift.v2CustodyKd} KD (drift=${branchDrift.driftKd} KD)`);
        }
        if (roleResult.status !== 'PASS') {
            const detail = 'mismatches' in roleResult && Array.isArray(roleResult.mismatches)
                ? ` (${roleResult.mismatches.length} users)`
                : '';
            issues.push(`roleConsistency=${roleResult.status}${detail}`);
        }
        if (ledgerInvariant.status !== 'PASS') {
            issues.push(`LEDGER INVARIANT VIOLATED: SUM(debit)=${ledgerInvariant.globalDebit} KD vs SUM(credit)=${ledgerInvariant.globalCredit} KD (${ledgerInvariant.unbalancedCount} unbalanced txs)`);
        }
        if (branchDrift.status === 'PASS' &&
            branchDrift.unattributedCustodyKd !== '0.0000') {
            issues.push(`unattributedBranchCustody=${branchDrift.unattributedCustodyKd} KD (custody bags without branchId)`);
        }
        if (ageSeverity !== 'OK' && ageDriverId) {
            issues.push(`oldestCashAge=${oldestAge.toFixed(2)}h (${ageSeverity}) on ${ageDriverName ?? ageDriverId}`);
        }
        const auditFailed = verifyResult.status !== 'PASS' ||
            integrityResult.status !== 'PASS' ||
            driverResult.status !== 'PASS' ||
            branchDrift.status !== 'PASS' ||
            roleResult.status !== 'PASS' ||
            ledgerInvariant.status !== 'PASS';
        const severity = auditFailed
            ? 'CRITICAL'
            : ageSeverity;
        return {
            severity,
            ssotTotalCash,
            oldestCashAgeHours: Number(oldestAge.toFixed(2)),
            ageSeverity,
            ageDriverId,
            ageDriverName,
            verifyStatus: verifyResult.status,
            integrityStatus: integrityResult.status,
            driverAmountStatus: driverResult.status,
            branchDriftStatus: branchDrift.status,
            branchDriftKd: branchDrift.driftKd,
            branchLedgerTotalKd: branchDrift.ledgerTotalKd,
            branchV2CustodyKd: branchDrift.v2CustodyKd,
            unattributedCustodyKd: branchDrift.unattributedCustodyKd,
            roleConsistencyStatus: roleResult.status,
            roleConsistencyMismatchCount: 'mismatches' in roleResult && Array.isArray(roleResult.mismatches)
                ? roleResult.mismatches.length
                : 0,
            ledgerInvariantStatus: ledgerInvariant.status,
            ledgerInvariantUnbalancedCount: ledgerInvariant.unbalancedCount,
            ledgerGlobalDebit: ledgerInvariant.globalDebit,
            ledgerGlobalCredit: ledgerInvariant.globalCredit,
            issues,
            generatedAt: new Date().toISOString(),
        };
    }
    async runLedgerInvariantCheck() {
        const to = new Date();
        const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
        const entries = await this.ledger.project({
            fromIso: from.toISOString(),
            toIso: to.toISOString(),
        });
        const recon = this.ledger.reconcile(entries, from.toISOString(), to.toISOString());
        return {
            status: recon.status,
            unbalancedCount: recon.unbalancedTransactions.length,
            globalDebit: recon.globalDebit,
            globalCredit: recon.globalCredit,
        };
    }
    async runBranchDriftCheck() {
        const [ledger, analysis] = await Promise.all([
            this.branchLedger.project(),
            this.v2.runAnalysis({}),
        ]);
        const ledgerMinor = (0, money_util_1.fixed4ToMinor)(ledger.totalCurrentBranchCash);
        const v2Minor = (0, money_util_1.fixed4ToMinor)(analysis.locationSummary.CUSTODY);
        const driftMinor = ledgerMinor - v2Minor;
        const absDriftMinor = driftMinor < 0n ? -driftMinor : driftMinor;
        const status = absDriftMinor <= BRANCH_DRIFT_TOLERANCE_MINOR ? 'PASS' : 'FAIL';
        return {
            status,
            driftKd: (0, money_util_1.minorToFixed4)(driftMinor),
            ledgerTotalKd: ledger.totalCurrentBranchCash,
            v2CustodyKd: analysis.locationSummary.CUSTODY,
            unattributedCustodyKd: ledger.unattributedCustodyKd,
        };
    }
    async publish(report) {
        const base = {
            event: 'cash_safety_audit',
            severity: report.severity,
            ssotTotalCash: report.ssotTotalCash,
            oldestCashAgeHours: report.oldestCashAgeHours,
            ageSeverity: report.ageSeverity,
            ageDriverId: report.ageDriverId,
            verifyStatus: report.verifyStatus,
            integrityStatus: report.integrityStatus,
            driverAmountStatus: report.driverAmountStatus,
            branchDriftStatus: report.branchDriftStatus,
            branchDriftKd: report.branchDriftKd,
            branchLedgerTotalKd: report.branchLedgerTotalKd,
            branchV2CustodyKd: report.branchV2CustodyKd,
            unattributedCustodyKd: report.unattributedCustodyKd,
            issuesCount: report.issues.length,
            issues: report.issues,
        };
        if (report.severity === 'OK') {
            this.logger.debug(JSON.stringify(base));
        }
        else if (report.severity === 'WARNING') {
            this.logger.warn(JSON.stringify(base));
        }
        else {
            this.logger.error(JSON.stringify(base));
        }
        const shouldAlert = report.severity === 'CRITICAL' ||
            report.severity === 'BLOCK' ||
            (report.severity === 'WARNING' && this.lastAlertedSeverity === 'OK');
        if (shouldAlert && this.notifier) {
            const lines = [
                `[Safari Cash Safety] ${report.severity}`,
                `Sigma classified.drivers[].amount = ${report.ssotTotalCash} KD`,
                `Branch cash (ledger)  = ${report.branchLedgerTotalKd} KD`,
                `Branch cash (v2 view) = ${report.branchV2CustodyKd} KD${report.branchDriftStatus === 'FAIL'
                    ? `  [DRIFT ${report.branchDriftKd} KD]`
                    : ''}`,
                `Oldest cash on driver: ${report.oldestCashAgeHours}h (${report.ageSeverity})${report.ageDriverName ? ` - ${report.ageDriverName}` : ''}`,
                `verify=${report.verifyStatus}  integrity=${report.integrityStatus}  driverAmount=${report.driverAmountStatus}  branchDrift=${report.branchDriftStatus}`,
            ];
            if (report.issues.length > 0) {
                lines.push('Issues:');
                for (const i of report.issues)
                    lines.push(`  - ${i}`);
            }
            lines.push('Action required: investigate the cash-intelligence layer in code; values are NOT auto-corrected by design.');
            try {
                const result = await this.notifier.send(lines.join('\n'));
                this.logger.log(JSON.stringify({
                    event: 'cash_safety_audit_alert_sent',
                    severity: report.severity,
                    via: result.via,
                    delivered: result.delivered,
                }));
            }
            catch (e) {
                this.logger.warn(`cash_safety_audit_alert_failed: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        this.lastAlertedSeverity = report.severity;
    }
};
exports.CashSafetyAuditCron = CashSafetyAuditCron;
__decorate([
    (0, schedule_1.Cron)('0 */5 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CashSafetyAuditCron.prototype, "sweep", null);
exports.CashSafetyAuditCron = CashSafetyAuditCron = CashSafetyAuditCron_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(8, (0, common_1.Optional)()),
    __param(8, (0, common_1.Inject)(owner_alert_notifier_service_1.OwnerAlertNotifierService)),
    __metadata("design:paramtypes", [cash_classifier_service_1.CashClassifierService,
        system_verify_service_1.SystemVerifyService,
        integrity_audit_service_1.IntegrityAuditService,
        driver_amount_audit_service_1.DriverAmountAuditService,
        branch_cash_ledger_service_1.BranchCashLedgerService,
        cash_intelligence_v2_service_1.CashIntelligenceV2Service,
        role_consistency_service_1.RoleConsistencyService,
        ledger_projection_service_1.LedgerProjectionService, Object])
], CashSafetyAuditCron);
//# sourceMappingURL=cash-safety-audit.cron.js.map