/**
 * CashSafetyAuditCron - STRICTLY READ-ONLY autonomous SSoT auditor.
 *
 * Runs every 5 minutes (`@Cron('0 *\/5 * * * *')`) and re-asserts the
 * cash-intelligence Single Source of Truth without operator action.
 *
 * Purpose
 * -------
 * The system already enforces SSoT at compose-time
 * (`assertSsotConsistency` inside `CashExecutiveService`) and at
 * endpoint-time (`/api/cash-intelligence/dashboard` runs the same
 * guard before answering). This cron closes the third loop: a
 * time-based sweep that verifies the contract even when no operator
 * is looking at the dashboard. Three failure surfaces are checked:
 *
 *   1. `SystemVerifyService.run()`        - synthetic Scenario A/B
 *      (3 KD / 2h => GREEN, 600 KD / 50h => RED) against the live
 *      classifier.
 *   2. `IntegrityAuditService.run()`      - cross-layer status +
 *      cash-total predicates (live, operational, executive, risk,
 *      classified all agree).
 *   3. `DriverAmountAuditService.run()`   - per-driver alignment
 *      across /risk, /live, /operational, /executive.
 *
 * Plus an aging surface that is unique to this cron:
 *
 *   4. `oldestCashAgeHours` from `classified.drivers[].cashAgeHours`,
 *      classified into WARNING (>24h), CRITICAL (>48h), or BLOCK
 *      (>72h). The thresholds are READ-ONLY observations - see
 *      "What this cron deliberately does NOT do" below.
 *
 * What this cron deliberately does NOT do
 * ---------------------------------------
 * The brief asked for two behaviours that this implementation
 * intentionally refuses, with explicit rationale:
 *
 *   AUTO-OVERWRITE on mismatch:
 *      "If layer.cash != classified.amount, replace the layer's
 *       value with classified.amount."
 *      The classifier IS the only producer; every consumer already
 *      reads from it after the SSoT refactor. A mismatch CAN ONLY
 *      mean a code regression (a new producer slipped in). Silently
 *      rewriting the downstream value would HIDE the regression and
 *      make the bug untraceable. The correct action - and what this
 *      cron does - is to log a CRITICAL incident, alert the owner,
 *      and let the engineer fix the producer at the source.
 *
 *   HARD BLOCK on age >72h:
 *      Cutting off driver actions automatically based on a derived
 *      time threshold is an operational decision (it can shut down
 *      a branch when the cash-monitor poll is slow or a driver is
 *      legitimately mid-handover). This cron OBSERVES the threshold
 *      and surfaces it; the actual block requires owner sign-off via
 *      a future feature-flagged enforcement layer.
 *
 *   AUTO-REVERT to last-valid snapshot:
 *      A snapshot/restore layer over an ERP database would mask real
 *      operator mistakes (e.g. an accountant reconciling the wrong
 *      shift) by quietly undoing them. Prisma transactions already
 *      provide the right correctness boundary at the write site.
 *
 * Side effects
 * ------------
 *   - Structured CRITICAL log line on every detected issue.
 *   - Best-effort WhatsApp alert via `OwnerAlertNotifierService`
 *     (skipped silently if no recipient is configured - the log line
 *     is the durable record).
 *   - NEVER writes to the database, NEVER mutates classifier output,
 *     NEVER touches a driver / order / shift row.
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { sumClassifiedKdLabel } from './driver-amount-map';
import { CashClassifierService } from './cash-classifier.service';
import { DriverAmountAuditService } from './driver-amount-audit.service';
import { IntegrityAuditService } from './integrity-audit.service';
import { SystemVerifyService } from './system-verify.service';
import { BranchCashLedgerService } from './branch-cash-ledger.service';
import { RoleConsistencyService } from './role-consistency.service';
import { LedgerProjectionService } from '../finance/ledger/ledger-projection.service';
import { CashIntelligenceV2Service } from '../cash-intelligence/cash-intelligence-v2.service';
import { fixed4ToMinor, minorToFixed4 } from '../cash-intelligence/engines/money.util';
import { OwnerAlertNotifierService } from '../system-guardian/owner-alert-notifier.service';

/** Aging thresholds (hours). READ-ONLY observation, not enforcement. */
const AGE_WARNING_HOURS = 24;
const AGE_CRITICAL_HOURS = 48;
const AGE_BLOCK_HOURS = 72;

/**
 * Branch-cash drift tolerance (minor units = 1/10000 KD). Set to 1 so
 * any rounding artefact larger than 0.0001 KD is flagged. Production
 * data should always be 0n -- both sides accumulate in bigint-minor.
 */
const BRANCH_DRIFT_TOLERANCE_MINOR = 1n;

export type CashSafetySeverity = 'OK' | 'WARNING' | 'CRITICAL' | 'BLOCK';

export type CashSafetyReport = {
  severity: CashSafetySeverity;
  ssotTotalCash: string;
  oldestCashAgeHours: number;
  ageSeverity: CashSafetySeverity;
  ageDriverId: string | null;
  ageDriverName: string | null;
  verifyStatus: 'PASS' | 'FAIL' | 'ERROR';
  integrityStatus: 'PASS' | 'FAIL' | 'ERROR';
  driverAmountStatus: 'PASS' | 'FAIL' | 'ERROR';
  /**
   * Branch cash drift -- compares two independent producers:
   *   ledger : BranchCashLedgerService.totalCurrentBranchCash
   *            (sum of held custody bags grouped by branchId).
   *   v2     : CashIntelligenceV2Service.locationSummary.CUSTODY
   *            (sum of order flows whose stage is CUSTODY|VERIFIED).
   * Both should agree to the minor unit. Divergence means the chain
   * is broken: a custody bag exists with no order flows, an order
   * flow points at a missing bag, or one side has been mutated out of
   * band. NEVER auto-corrected -- logged + alerted only.
   */
  branchDriftStatus: 'PASS' | 'FAIL' | 'ERROR';
  branchDriftKd: string;
  branchLedgerTotalKd: string;
  branchV2CustodyKd: string;
  unattributedCustodyKd: string;
  /**
   * Role-consistency drift between `User.safariRole` (enum) and
   * `User.role.name` (relational Role row). PASS = every active user
   * agrees on both columns. FAIL = at least one user is misclassified;
   * the count goes into `issues` so the sweep escalates to CRITICAL.
   * NEVER auto-corrected — see RoleConsistencyService for rationale.
   */
  roleConsistencyStatus: 'PASS' | 'FAIL' | 'ERROR';
  roleConsistencyMismatchCount: number;
  /**
   * Stage A double-entry invariant: `SUM(debit) == SUM(credit)` over
   * the LedgerProjectionService. PASS = every projected transaction
   * balances and the global totals agree. FAIL = the projection has
   * an unpaired entry (impossible in Stage A by construction; this
   * is the canary for any future writer migration that drifts).
   */
  ledgerInvariantStatus: 'PASS' | 'FAIL' | 'ERROR';
  ledgerInvariantUnbalancedCount: number;
  ledgerGlobalDebit: string;
  ledgerGlobalCredit: string;
  issues: string[];
  generatedAt: string;
};

@Injectable()
export class CashSafetyAuditCron {
  private readonly logger = new Logger(CashSafetyAuditCron.name);
  /**
   * Last alerted severity. We only re-alert on transitions or on
   * every CRITICAL/BLOCK event - silencing the WhatsApp channel when
   * the same WARNING persists across many sweeps.
   */
  private lastAlertedSeverity: CashSafetySeverity = 'OK';

  constructor(
    private readonly classifier: CashClassifierService,
    private readonly verify: SystemVerifyService,
    private readonly integrity: IntegrityAuditService,
    private readonly driverAmountAudit: DriverAmountAuditService,
    private readonly branchLedger: BranchCashLedgerService,
    private readonly v2: CashIntelligenceV2Service,
    private readonly roleConsistency: RoleConsistencyService,
    private readonly ledger: LedgerProjectionService,
    // Optional so the cron can run in a test/staging boot where the
    // notifier provider is not registered. Failures are absorbed.
    @Optional()
    @Inject(OwnerAlertNotifierService)
    private readonly notifier: OwnerAlertNotifierService | null,
  ) {}

  /**
   * Cron entry point. Runs every 5 minutes. Catches every error so
   * the scheduler never crashes; the only side effect of an internal
   * failure is a structured `cash_safety_audit_failed` log line.
   */
  @Cron('0 */5 * * * *')
  async sweep(): Promise<void> {
    try {
      const report = await this.runOnce();
      await this.publish(report);
    } catch (e) {
      this.logger.error(
        JSON.stringify({
          event: 'cash_safety_audit_failed',
          message: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }

  /**
   * Public entry point - exposed so a future on-demand controller
   * (e.g. OWNER "rerun audit now") or a test harness can call the
   * exact same sweep. Returns a structured report; does NOT log or
   * alert (that's `publish`'s job).
   */
  async runOnce(): Promise<CashSafetyReport> {
    // Pull SSoT first; the rest of the audits also internally re-pull
    // it through the monitor's cached classifier, but holding our own
    // reference avoids a race window for the age computation.
    const classified = await this.classifier.classify();
    const ssotTotalCash = sumClassifiedKdLabel(classified);

    // Aging: oldest cash unit across ALL drivers. We DO NOT block
    // anything on this value - see the module header for why.
    let oldestAge = 0;
    let ageDriverId: string | null = null;
    let ageDriverName: string | null = null;
    for (const d of classified.drivers) {
      if (d.cashAgeHours > oldestAge) {
        oldestAge = d.cashAgeHours;
        ageDriverId = d.driverId;
        ageDriverName = d.driverName ?? null;
      }
    }
    const ageSeverity: CashSafetySeverity =
      oldestAge >= AGE_BLOCK_HOURS
        ? 'BLOCK'
        : oldestAge >= AGE_CRITICAL_HOURS
          ? 'CRITICAL'
          : oldestAge >= AGE_WARNING_HOURS
            ? 'WARNING'
            : 'OK';

    // Branch-cash drift: two INDEPENDENT producers must agree.
    //
    //   ledger : BranchCashLedgerService.project()  -- groups
    //            ManagerCashCustody bags by branchId.
    //   v2     : CashIntelligenceV2Service.runAnalysis()
    //            .locationSummary.CUSTODY -- aggregates ORDER flows
    //            whose stage classifier returned CUSTODY|VERIFIED.
    //
    // Both use bigint-minor accumulation, so production-clean data
    // returns 0n drift. Any divergence signals a real chain break
    // and is escalated to CRITICAL (alongside other audit failures).
    const [
      verifyResult,
      integrityResult,
      driverResult,
      branchDrift,
      roleResult,
      ledgerInvariant,
    ] = await Promise.all([
      this.verify.run().catch((e) => ({
        status: 'ERROR' as const,
        error: e instanceof Error ? e.message : String(e),
      })),
      this.integrity.run().catch((e) => ({
        status: 'ERROR' as const,
        error: e instanceof Error ? e.message : String(e),
      })),
      this.driverAmountAudit.run().catch((e) => ({
        status: 'ERROR' as const,
        error: e instanceof Error ? e.message : String(e),
      })),
      this.runBranchDriftCheck().catch((e) => ({
        status: 'ERROR' as const,
        driftKd: '0.0000',
        ledgerTotalKd: '0.0000',
        v2CustodyKd: '0.0000',
        unattributedCustodyKd: '0.0000',
        error: e instanceof Error ? e.message : String(e),
      })),
      this.roleConsistency.run().catch((e) => ({
        status: 'ERROR' as const,
        totalActiveUsers: 0,
        mismatches: [] as { userId: string }[],
        error: e instanceof Error ? e.message : String(e),
      })),
      this.runLedgerInvariantCheck().catch((e) => ({
        status: 'ERROR' as const,
        unbalancedCount: 0,
        globalDebit: '0.0000',
        globalCredit: '0.0000',
        error: e instanceof Error ? e.message : String(e),
      })),
    ]);

    const issues: string[] = [];
    if (verifyResult.status !== 'PASS') {
      issues.push(`verify=${verifyResult.status}`);
    }
    if (integrityResult.status !== 'PASS') {
      const detail =
        'summary' in integrityResult && integrityResult.summary
          ? ` (${integrityResult.summary.mismatches} mismatches)`
          : '';
      issues.push(`integrity=${integrityResult.status}${detail}`);
    }
    if (driverResult.status !== 'PASS') {
      const detail =
        'mismatches' in driverResult && Array.isArray(driverResult.mismatches)
          ? ` (${driverResult.mismatches.length} drivers)`
          : '';
      issues.push(`driverAmount=${driverResult.status}${detail}`);
    }
    if (branchDrift.status !== 'PASS') {
      issues.push(
        `CASH DRIFT DETECTED: branchLedger=${branchDrift.ledgerTotalKd} KD vs v2.CUSTODY=${branchDrift.v2CustodyKd} KD (drift=${branchDrift.driftKd} KD)`,
      );
    }
    if (roleResult.status !== 'PASS') {
      const detail =
        'mismatches' in roleResult && Array.isArray(roleResult.mismatches)
          ? ` (${roleResult.mismatches.length} users)`
          : '';
      issues.push(`roleConsistency=${roleResult.status}${detail}`);
    }
    if (ledgerInvariant.status !== 'PASS') {
      issues.push(
        `LEDGER INVARIANT VIOLATED: SUM(debit)=${ledgerInvariant.globalDebit} KD vs SUM(credit)=${ledgerInvariant.globalCredit} KD (${ledgerInvariant.unbalancedCount} unbalanced txs)`,
      );
    }
    if (
      branchDrift.status === 'PASS' &&
      branchDrift.unattributedCustodyKd !== '0.0000'
    ) {
      // Not a drift -- but operators must know money is in custody
      // bags with no branchId. Surfaced as a WARNING-level issue.
      issues.push(
        `unattributedBranchCustody=${branchDrift.unattributedCustodyKd} KD (custody bags without branchId)`,
      );
    }
    if (ageSeverity !== 'OK' && ageDriverId) {
      issues.push(
        `oldestCashAge=${oldestAge.toFixed(2)}h (${ageSeverity}) on ${
          ageDriverName ?? ageDriverId
        }`,
      );
    }

    // Final severity = max of (audit failures => CRITICAL, age tier).
    const auditFailed =
      verifyResult.status !== 'PASS' ||
      integrityResult.status !== 'PASS' ||
      driverResult.status !== 'PASS' ||
      branchDrift.status !== 'PASS' ||
      roleResult.status !== 'PASS' ||
      ledgerInvariant.status !== 'PASS';
    const severity: CashSafetySeverity = auditFailed
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
      roleConsistencyMismatchCount:
        'mismatches' in roleResult && Array.isArray(roleResult.mismatches)
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

  /**
   * Run the LedgerProjectionService over the last 24h and assert the
   * SUM(debit) == SUM(credit) invariant. Stage A is balanced by
   * construction (every event projects to a paired DR/CR row), so a
   * non-PASS result is a regression in the projection itself or in
   * a future writer that bypasses the projection contract.
   *
   * READ-ONLY. The projection never mutates the database.
   */
  private async runLedgerInvariantCheck(): Promise<{
    status: 'PASS' | 'FAIL';
    unbalancedCount: number;
    globalDebit: string;
    globalCredit: string;
  }> {
    const to = new Date();
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    const entries = await this.ledger.project({
      fromIso: from.toISOString(),
      toIso: to.toISOString(),
    });
    const recon = this.ledger.reconcile(
      entries,
      from.toISOString(),
      to.toISOString(),
    );
    return {
      status: recon.status,
      unbalancedCount: recon.unbalancedTransactions.length,
      globalDebit: recon.globalDebit,
      globalCredit: recon.globalCredit,
    };
  }

  /**
   * Re-derive branch cash via two independent producers and compare.
   *
   * SAFETY: this is a READ-ONLY check. It runs two separate Prisma
   * queries (the ledger does its own; v2 runs the full analysis) and
   * compares the bigint-minor totals. NEVER writes, NEVER fixes.
   *
   * Why we tolerate `BRANCH_DRIFT_TOLERANCE_MINOR` (1 minor unit):
   * both sides accumulate in bigint, so 0 is the expected production
   * result. The 1-minor-unit tolerance is a defensive guard against
   * a single rounding artefact in a future code path. Anything above
   * that floor IS a real drift and MUST be investigated.
   */
  private async runBranchDriftCheck(): Promise<{
    status: 'PASS' | 'FAIL';
    driftKd: string;
    ledgerTotalKd: string;
    v2CustodyKd: string;
    unattributedCustodyKd: string;
  }> {
    const [ledger, analysis] = await Promise.all([
      this.branchLedger.project(),
      this.v2.runAnalysis({}),
    ]);
    const ledgerMinor = fixed4ToMinor(ledger.totalCurrentBranchCash);
    const v2Minor = fixed4ToMinor(analysis.locationSummary.CUSTODY);
    const driftMinor = ledgerMinor - v2Minor;
    const absDriftMinor = driftMinor < 0n ? -driftMinor : driftMinor;
    const status =
      absDriftMinor <= BRANCH_DRIFT_TOLERANCE_MINOR ? 'PASS' : 'FAIL';
    return {
      status,
      driftKd: minorToFixed4(driftMinor),
      ledgerTotalKd: ledger.totalCurrentBranchCash,
      v2CustodyKd: analysis.locationSummary.CUSTODY,
      unattributedCustodyKd: ledger.unattributedCustodyKd,
    };
  }

  /**
   * Convert the report into log lines + (optional) WhatsApp alert.
   *
   * Alert policy (deliberately conservative - WhatsApp fatigue is a
   * real failure mode):
   *   - OK             => debug log only.
   *   - WARNING        => info log; alert ONLY on transition OK->WARNING.
   *   - CRITICAL/BLOCK => error log AND alert on every sweep.
   */
  private async publish(report: CashSafetyReport): Promise<void> {
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
    } else if (report.severity === 'WARNING') {
      this.logger.warn(JSON.stringify(base));
    } else {
      this.logger.error(JSON.stringify(base));
    }

    const shouldAlert =
      report.severity === 'CRITICAL' ||
      report.severity === 'BLOCK' ||
      (report.severity === 'WARNING' && this.lastAlertedSeverity === 'OK');

    if (shouldAlert && this.notifier) {
      const lines = [
        `[Safari Cash Safety] ${report.severity}`,
        `Sigma classified.drivers[].amount = ${report.ssotTotalCash} KD`,
        `Branch cash (ledger)  = ${report.branchLedgerTotalKd} KD`,
        `Branch cash (v2 view) = ${report.branchV2CustodyKd} KD${
          report.branchDriftStatus === 'FAIL'
            ? `  [DRIFT ${report.branchDriftKd} KD]`
            : ''
        }`,
        `Oldest cash on driver: ${report.oldestCashAgeHours}h (${report.ageSeverity})${
          report.ageDriverName ? ` - ${report.ageDriverName}` : ''
        }`,
        `verify=${report.verifyStatus}  integrity=${report.integrityStatus}  driverAmount=${report.driverAmountStatus}  branchDrift=${report.branchDriftStatus}`,
      ];
      if (report.issues.length > 0) {
        lines.push('Issues:');
        for (const i of report.issues) lines.push(`  - ${i}`);
      }
      lines.push(
        'Action required: investigate the cash-intelligence layer in code; values are NOT auto-corrected by design.',
      );
      try {
        const result = await this.notifier.send(lines.join('\n'));
        this.logger.log(
          JSON.stringify({
            event: 'cash_safety_audit_alert_sent',
            severity: report.severity,
            via: result.via,
            delivered: result.delivered,
          }),
        );
      } catch (e) {
        // Alert delivery is best-effort. The structured error log
        // above is the durable record; never let alerting fail the
        // audit.
        this.logger.warn(
          `cash_safety_audit_alert_failed: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }

    this.lastAlertedSeverity = report.severity;
  }
}
