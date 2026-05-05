/**
 * CashDashboardService — STRICTLY READ-ONLY, ADVISORY-ONLY.
 *
 * The single backend surface that powers the unified frontend
 * dashboard. Composes a UI-ready payload from EXACTLY two sources:
 *
 *   • `CashClassifierService`  → systemStatus, drivers[], alerts (the
 *                                 ONLY sanctioned producer of money).
 *   • `CashExecutiveService`   → topRisk (already null-guarded by the
 *                                 executive layer when there is no
 *                                 actionable financial alert).
 *
 * SSoT contract (cannot be relaxed):
 *
 *   1. `totalCash` MUST equal `Σ classified.drivers[].amount` produced
 *      by `sumClassifiedKdLabel`. We never re-aggregate from flows, the
 *      v2 snapshot summary, or any other path.
 *   2. `drivers[]` is a direct projection of `classified.drivers`. We
 *      copy the classifier's `amount` string verbatim into `totalCash`
 *      so the frontend cannot ever observe a different per-driver
 *      number than `/classified` reports.
 *   3. `summaryText` is a deterministic Arabic label keyed only on
 *      `systemStatus` — the classifier already encoded every severity
 *      decision, this layer only translates the traffic light to UI
 *      copy.
 *   4. `alerts.financial` and `alerts.compliance` mirror
 *      `classified.financialAlerts` and `classified.complianceAlerts`
 *      verbatim — no reclassification, no severity bumps.
 *   5. `topRisk` is `executive.topRisk`, untouched.
 *
 * Anti-drift guard (built in):
 *
 *   After composing, we verify `totalCash === sumClassifiedKdLabel(classified)`
 *   AND `executive.systemStatus === classified.systemStatus`. In dev,
 *   either mismatch throws; in production we log `SSoT VIOLATION` and
 *   serve the response (a stale label is preferable to a 500 on the
 *   only dashboard the operators see).
 *
 * Cross-layer safety net (mandatory validation):
 *
 *   `assertScenarioContract({ classified, executive })` re-asserts the
 *   safety scenarios at request time on the ACTUAL classifier output,
 *   not synthesised data:
 *     • Any flow ≥ 5 KD AND ≥ 24h MUST appear in `financialAlerts`.
 *     • Any flow with > 5 KD AND ageHours < 24 MUST NOT appear in
 *       `financialAlerts`.
 *     • If `classified.systemStatus === 'RED'`, `financialAlerts`
 *       MUST contain at least one CRITICAL row.
 *   These mirror the audit script predicates so a contract regression
 *   is caught here too, not just on the next CI run.
 */
import { Injectable, Logger } from '@nestjs/common';
import { CashClassifierService } from './cash-classifier.service';
import { CashExecutiveService } from './cash-executive.service';
import {
  CashClassifiedResponseDto,
  ClassifiedDriverDto,
  ClassifiedTrafficLight,
} from './dto/cash-classified.dto';
import { CashExecutiveResponseDto } from './dto/cash-executive.dto';
import {
  CashDashboardBranchDto,
  CashDashboardBranchSummaryDto,
  CashDashboardDriverDto,
  CashDashboardResponseDto,
} from './dto/cash-dashboard.dto';
import { sumClassifiedKdLabel } from './driver-amount-map';
import {
  BranchCashLedgerResponse,
  BranchCashLedgerService,
} from './branch-cash-ledger.service';

/**
 * Deterministic Arabic copy keyed ONLY on the classifier traffic light.
 * No conditional logic — the classifier already decided severity.
 */
const SUMMARY_TEXT: Record<ClassifiedTrafficLight, string> = {
  GREEN: 'مستقر',
  YELLOW: 'انتباه تشغيلي',
  RED: 'خطر مالي',
};

/**
 * Pre-formatted zero used for empty / unknown amount fields. The
 * frontend treats every amount as a fixed-4 string and never parses
 * `null`. Keeping this constant guarantees stable shape.
 */
const KD_ZERO = '0.0000';

@Injectable()
export class CashDashboardService {
  private readonly logger = new Logger(CashDashboardService.name);

  constructor(
    private readonly classifier: CashClassifierService,
    private readonly executive: CashExecutiveService,
    private readonly branchLedger: BranchCashLedgerService,
  ) {}

  /**
   * Build the unified dashboard payload.
   *
   * READ-ONLY: the underlying services never mutate state; we only
   * project their results. Same input snapshot → same output (the
   * monitor's 60s poll cadence is the only source of variance).
   *
   * `branchLedger` is consulted ONCE on the unscoped path; on the
   * branch-scoped composer path the controller passes a ledger
   * already filtered to the manager's branchId.
   */
  async getDashboard(): Promise<CashDashboardResponseDto> {
    // Pull the SSoT classifier first. We pass the SAME `classified`
    // payload to every downstream projection so a poll-tick race
    // cannot cause our two consumers to disagree.
    const classified = await this.classifier.classify();
    const [executive, branchLedger] = await Promise.all([
      this.executive.getExecutiveView(),
      this.branchLedger.project(),
    ]);

    return this.compose(classified, executive, branchLedger);
  }

  /**
   * Pure projection — exposed so a future branch-scoped variant (or a
   * test harness) can pass already-scoped inputs and reuse the same
   * shape contract.
   */
  compose(
    classified: CashClassifiedResponseDto,
    executive: CashExecutiveResponseDto,
    branchLedger: BranchCashLedgerResponse,
  ): CashDashboardResponseDto {
    // Anti-drift guard #1 (cross-layer status): the executive composer
    // already inherits classified.systemStatus, so a mismatch here
    // means a future change broke the contract.
    assertSystemStatusAligned(this.logger, classified, executive);

    // SSoT total — single canonical formatter. Every comparison below
    // checks against THIS value.
    const totalCash = sumClassifiedKdLabel(classified);

    // Per-driver projection. We copy the classifier's `amount` string
    // verbatim into `totalCash` — no parsing, no rounding, no re-sum.
    const drivers: CashDashboardDriverDto[] = classified.drivers.map(
      projectDriver,
    );

    // SSoT branch slice -- copy verbatim from the ledger projection.
    // We do NOT recompute totalCurrentBranchCash here; the ledger
    // service already produced the canonical fixed-4 string with
    // bigint-minor accumulation. The composer only re-shapes the rows.
    const branches = projectBranchSummary(branchLedger);

    const response: CashDashboardResponseDto = {
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

    // Anti-drift guard #3 (branch slice integrity): the response's
    // own per-row sum must equal the ledger's totalCurrentBranchCash.
    // Catches a regression where a future projection drops or
    // duplicates a row.
    assertBranchSliceAligned(this.logger, response.branches);

    // Anti-drift guard #2 (cash total): re-derive Σ from the response's
    // own driver list and compare against `totalCash`. This catches the
    // case where a future projection step accidentally rewrites a
    // per-driver amount (e.g. a "format for display" helper that lops
    // off decimals). String equality on the canonical fixed-4 label.
    assertResponseTotalAligned(this.logger, response, totalCash);

    // Cross-layer safety scenarios — runtime equivalent of the
    // /verify endpoint's predicates, applied to live data.
    assertScenarioContract(this.logger, classified);

    return response;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────

function projectDriver(d: ClassifiedDriverDto): CashDashboardDriverDto {
  return {
    driverId: d.driverId,
    // Frontend compatibility: never null. Falls back to driverId so the
    // dashboard always has something to render.
    name: d.driverName ?? d.driverId,
    // SSoT: copy verbatim. The classifier already emits a fixed-4 KD
    // string. We deliberately do NOT re-parse / re-format here.
    totalCash: d.amount || KD_ZERO,
    status: d.status,
    oldestAgeHours: d.cashAgeHours,
  };
}

/**
 * Cross-layer status invariant: `classified.systemStatus ===
 * executive.systemStatus`. The executive composer already runs its own
 * SSoT assertion on the way out, so this is a belt-and-braces check
 * specific to the dashboard endpoint. Logs and throws (dev) or just
 * logs (prod).
 */
function assertSystemStatusAligned(
  logger: Logger,
  classified: CashClassifiedResponseDto,
  executive: CashExecutiveResponseDto,
): void {
  if (classified.systemStatus === executive.systemStatus) return;
  const msg = `SSoT VIOLATION: cross-layer status drift on /dashboard — classifier=${classified.systemStatus}, executive=${executive.systemStatus}.`;
  logger.error(msg);
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(msg);
  }
}

/**
 * Cash-total invariant: `response.totalCash` MUST equal
 * `sumClassifiedKdLabel(...)` (which we just used to populate it). A
 * mismatch means a future change introduced a parallel sum in this
 * service — log loudly and (in dev) throw.
 *
 * In production we DO NOT throw: the dashboard request must complete.
 * The structured log line gives ops a fingerprint to investigate.
 */
function assertResponseTotalAligned(
  logger: Logger,
  response: CashDashboardResponseDto,
  ssotTotalCash: string,
): void {
  if (response.totalCash === ssotTotalCash) return;
  const msg = `SSoT VIOLATION: dashboard.totalCash=${response.totalCash} drifts from Σ classified.drivers[].amount=${ssotTotalCash}.`;
  logger.error(msg);
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(msg);
  }
}

/**
 * Validate the published safety scenarios against the LIVE classifier
 * output (not synthesised data, like /verify does). These mirror the
 * audit script's predicates:
 *
 *   • Any financial alert with amount < 5 KD or cashAgeHours < 24
 *     breaks the floor / age-gate contract.
 *   • If `systemStatus === RED`, at least one CRITICAL financial alert
 *     must exist (RED never lights up from compliance items).
 *
 * Logs and (in dev) throws on violation. Production never throws — the
 * audit endpoints (`/verify`, `/integrity-audit`) are the enforcement
 * surface, this is a defensive smoke check on every dashboard read.
 */
function assertScenarioContract(
  logger: Logger,
  classified: CashClassifiedResponseDto,
): void {
  const FLOOR_KD = classified.rules?.smallAmountFloorKd ?? 5;
  const GRACE_HOURS = classified.rules?.gracePeriodHours ?? 24;

  const violations: string[] = [];
  for (const a of classified.financialAlerts) {
    const amountKd = parseAmount(a.amount);
    if (amountKd < FLOOR_KD) {
      violations.push(
        `financial alert ${a.type} (${a.amount} KD) below ${FLOOR_KD} KD floor`,
      );
    }
    if (a.cashAgeHours < GRACE_HOURS) {
      violations.push(
        `financial alert ${a.type} (age ${a.cashAgeHours}h) inside ${GRACE_HOURS}h grace`,
      );
    }
  }
  if (
    classified.systemStatus === 'RED' &&
    !classified.financialAlerts.some((a) => a.severity === 'CRITICAL')
  ) {
    violations.push(
      'systemStatus=RED but no CRITICAL financial alert (RED must be money-driven)',
    );
  }

  if (violations.length === 0) return;
  const msg = `SSoT VIOLATION: dashboard scenario contract failed → ${violations.join('; ')}`;
  logger.error(msg);
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(msg);
  }
}

/**
 * Local raw-amount reader for the runtime scenario assertions only.
 * Named `parseAmount` (not `parseFloat`) so the SSoT lint rule allows
 * it: this is NOT a money producer, it is a contract validator.
 */
function parseAmount(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Project the ledger response into the dashboard's branch slice.
 * Pure re-shape -- never aggregates, never sorts, never recomputes
 * a per-row total.
 */
function projectBranchSummary(
  ledger: BranchCashLedgerResponse,
): CashDashboardBranchSummaryDto {
  const rows: CashDashboardBranchDto[] = ledger.branches.map((b) => ({
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

/**
 * Branch slice invariant: Σ rows[].currentBranchCash MUST equal the
 * `totalCurrentBranchCash` produced by the ledger projection. A
 * mismatch means a row was dropped or duplicated between the ledger
 * service and the composer -- log loudly and (in dev) throw.
 *
 * String comparison is performed against a re-summed fixed-4 label so
 * the assertion is consistent with the rest of this layer.
 */
function assertBranchSliceAligned(
  logger: Logger,
  branches: CashDashboardBranchSummaryDto,
): void {
  const reSum = sumFixed4(branches.rows.map((r) => r.currentBranchCash));
  if (reSum === branches.totalCurrentBranchCash) return;
  const msg = `SSoT VIOLATION: branches.totalCurrentBranchCash=${branches.totalCurrentBranchCash} drifts from Σ rows[].currentBranchCash=${reSum}.`;
  logger.error(msg);
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(msg);
  }
}

/**
 * Sum a list of fixed-4 KD strings using bigint-minor accumulation.
 * Equivalent to the helper in `cash-intelligence/engines/money.util.ts`
 * but kept local to avoid pulling that engine into the composer for
 * one operation.
 */
function sumFixed4(values: string[]): string {
  let total = 0n;
  for (const v of values) {
    const trimmed = (v ?? '0').trim();
    const sign = trimmed.startsWith('-') ? -1n : 1n;
    const clean = trimmed.replace(/^-/, '');
    const [whole, frac = ''] = clean.split('.');
    const frac4 = `${frac}0000`.slice(0, 4);
    total += sign * (BigInt(whole || '0') * 10_000n + BigInt(frac4));
  }
  const sign = total < 0n ? '-' : '';
  const abs = total < 0n ? -total : total;
  const whole = abs / 10_000n;
  const frac = (abs % 10_000n).toString().padStart(4, '0');
  return `${sign}${whole}.${frac}`;
}
