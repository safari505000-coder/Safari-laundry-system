import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import {
  JOURNAL_ACCOUNTS,
  DoubleEntryJournalService,
} from '../../general-ledger/double-entry-journal.service';

/**
 * V20.4 — Phase 6 financial reconciliation engine.
 * V24  — Station 1 hardened with SNAPSHOT_AR_MATCH for the
 *        Reconciliation Baseline (Snapshot ↔ Ledger lock).
 *
 * Single-purpose service that runs the banking-grade invariants
 * the V20.3.4 forensic audit flagged as "must hold post-V20.4",
 * plus the V24 projection-integrity invariant:
 *
 *   1. TRIAL BALANCE        — Σ DR = Σ CR globally.
 *   2. ASSETS = LIABILITIES + EQUITY (extended balance sheet identity).
 *   3. WALLET LIABILITY MATCH — Σ JournalEntry.WALLET_LIABILITY net
 *      credits == Σ CustomerWallet.balance.
 *   4. AR INTEGRITY         — Σ JournalEntry.ACCOUNTS_RECEIVABLE net
 *      debits == Σ open invoice remaining balances (legacy reader).
 *   5. SNAPSHOT_AR_MATCH    — V24: Σ JournalEntry.ACCOUNTS_RECEIVABLE
 *      net debits == Σ FinancialSnapshot.remainingDebtKd. Catches
 *      projector bugs and stale snapshot rows the V20.4 cron
 *      hasn't refreshed yet.
 *
 * Each invariant produces a numeric `delta` and a boolean `ok`.
 * Failure rows emit a domain event (`finance.drift.detected`) so
 * the operator dashboard, Slack alerter, and KPI tile can react
 * without polling.
 *
 * Scheduling: hourly cron (configurable). The `runOnce()` method
 * is exposed for the reconciliation HTTP endpoint and for tests.
 *
 * Read-only and idempotent — the service NEVER writes to the
 * journal or any wallet/order. It can safely run alongside live
 * traffic. The only side-effect is the optional event emission.
 *
 * --- Tolerance Rationale (V24) ---
 *
 * `TOLERANCE_KD = 0.001` (3dp). All amounts are stored at 4dp,
 * so this is a deliberate 1-fils slack band that absorbs the
 * legitimate runtime micro-drift sources:
 *   - Open partial-payment row mid-write (the writer COMMITs in
 *     two journal lines + one snapshot refresh → naturally
 *     observable across the cron cycle).
 *   - Customer-wallet rounding when the FX-equivalent helper
 *     materialises a 0.0001 KD epsilon difference.
 *   - Decimal aggregation rounding over 100k+ rows.
 *
 * Anything above 0.001 KD is treated as real drift. The
 * `v24-reconciliation-baseline.spec.ts` lock-in test asserts a
 * STRICTER 0 KD drift on the seeded fixture so the projector and
 * journal stay perfectly aligned in CI. Production tolerates the
 * 0.001 band; CI does not.
 */

const TOLERANCE_KD = new Prisma.Decimal('0.001');

export type ReconciliationInvariant =
  | 'TRIAL_BALANCE'
  | 'ASSETS_EQ_LIAB_PLUS_EQUITY'
  | 'WALLET_LIABILITY_MATCH'
  | 'AR_INTEGRITY'
  | 'SNAPSHOT_AR_MATCH';

export type ReconciliationResultRow = {
  invariant: ReconciliationInvariant;
  expectedKd: string;
  actualKd: string;
  deltaKd: string;
  ok: boolean;
  detail?: string;
};

export type ReconciliationReport = {
  generatedAt: string;
  durationMs: number;
  toleranceKd: string;
  rows: ReconciliationResultRow[];
  driftCount: number;
  ok: boolean;
};

export const FINANCE_DRIFT_EVENT = 'finance.drift.detected';

export type FinanceDriftPayload = {
  invariant: ReconciliationInvariant;
  expectedKd: string;
  actualKd: string;
  deltaKd: string;
  detail?: string;
  generatedAt: string;
};

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: DoubleEntryJournalService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Hourly cron — runs the full sweep, logs the report, and emits
   * one `finance.drift.detected` event per failing invariant. Wrapped
   * in a try/catch so a transient DB blip can't take down the
   * scheduler.
   *
   * Disabled when `RECONCILIATION_CRON_ENABLED=false` so test
   * environments / local dev don't fight the scheduler.
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'v20_4_reconciliation' })
  async hourlyReconciliation(): Promise<void> {
    if (!this.isCronEnabled()) {
      this.logger.debug(
        'V20.4 reconciliation cron skipped (RECONCILIATION_CRON_ENABLED!=true)',
      );
      return;
    }
    try {
      const report = await this.runOnce();
      this.logger.log(
        `[V20_4_RECONCILIATION] generatedAt=${report.generatedAt} ` +
          `durationMs=${report.durationMs} driftCount=${report.driftCount} ok=${report.ok}`,
      );
    } catch (err) {
      this.logger.error(
        `[V20_4_RECONCILIATION_FAILED] ${(err as Error).message}`,
      );
    }
  }

  private isCronEnabled(): boolean {
    const v = (process.env.RECONCILIATION_CRON_ENABLED ?? '')
      .toString()
      .trim()
      .toLowerCase();
    return v === 'true' || v === '1' || v === 'on' || v === 'yes';
  }

  /**
   * Runs the four invariants and returns a single report object.
   *
   * The HTTP endpoint and the cron both call this. Each invariant
   * is independent — one failure does not prevent the others from
   * running.
   */
  async runOnce(): Promise<ReconciliationReport> {
    const startedAt = Date.now();
    const generatedAt = new Date().toISOString();
    const rows: ReconciliationResultRow[] = [];

    rows.push(await this.checkTrialBalance());
    rows.push(await this.checkBalanceSheetIdentity());
    rows.push(await this.checkWalletLiabilityMatch());
    rows.push(await this.checkArIntegrity());
    rows.push(await this.checkSnapshotArMatch());

    const failing = rows.filter((r) => !r.ok);
    for (const row of failing) {
      this.logger.warn(
        `[FINANCIAL_DRIFT] invariant=${row.invariant} expected=${row.expectedKd} ` +
          `actual=${row.actualKd} delta=${row.deltaKd} detail=${row.detail ?? ''}`,
      );
      const payload: FinanceDriftPayload = {
        invariant: row.invariant,
        expectedKd: row.expectedKd,
        actualKd: row.actualKd,
        deltaKd: row.deltaKd,
        detail: row.detail,
        generatedAt,
      };
      this.events.emit(FINANCE_DRIFT_EVENT, payload);
    }

    const durationMs = Date.now() - startedAt;
    return {
      generatedAt,
      durationMs,
      toleranceKd: TOLERANCE_KD.toFixed(4),
      rows,
      driftCount: failing.length,
      ok: failing.length === 0,
    };
  }

  /**
   * Invariant 1 — Trial Balance: Σ DR = Σ CR over every JournalLine.
   *
   * If this ever fails, every other invariant is unreliable because
   * the underlying journal is internally inconsistent. The
   * application-layer `appendBalanced` validation (debits === credits
   * per entry) is what GUARDS this; this check is the post-hoc proof.
   */
  private async checkTrialBalance(): Promise<ReconciliationResultRow> {
    const agg = await this.prisma.journalLine.aggregate({
      _sum: { debit: true, credit: true },
    });
    const totalDebit = new Prisma.Decimal(agg._sum.debit?.toString() ?? '0');
    const totalCredit = new Prisma.Decimal(agg._sum.credit?.toString() ?? '0');
    const delta = totalDebit.sub(totalCredit);
    const ok = delta.abs().lessThanOrEqualTo(TOLERANCE_KD);
    return {
      invariant: 'TRIAL_BALANCE',
      expectedKd: totalDebit.toFixed(4),
      actualKd: totalCredit.toFixed(4),
      deltaKd: delta.toFixed(4),
      ok,
      detail: ok ? undefined : 'JOURNAL_INTERNALLY_UNBALANCED',
    };
  }

  /**
   * Invariant 2 — Balance Sheet Identity: Σ Assets = Σ Liabilities + Σ Equity.
   *
   * Computed by aggregating JournalLine debit-credit per account
   * and grouping by AccountType. Revenue and Expense flow into
   * Equity (REVENUE − EXPENSE = current-period profit, which is
   * the equity adjustment).
   *
   * Note: REVENUE and EXPENSE are leaf accounts that contribute
   * to Equity through the period-close convention; we don't
   * physically close periods (V20.4 doesn't ship period-end
   * close), so we treat REVENUE − EXPENSE as the implicit
   * Equity contribution.
   */
  private async checkBalanceSheetIdentity(): Promise<ReconciliationResultRow> {
    const grouped = await this.prisma.$queryRaw<
      Array<{ type: string; total: string }>
    >`
      SELECT a."type",
             SUM(jl."debit" - jl."credit")::text AS total
      FROM "JournalLine" jl
      JOIN "Account" a ON a."id" = jl."accountId"
      GROUP BY a."type"
    `;
    let assets = new Prisma.Decimal(0);
    let liabilities = new Prisma.Decimal(0);
    let equity = new Prisma.Decimal(0);
    let revenue = new Prisma.Decimal(0);
    let expense = new Prisma.Decimal(0);
    for (const row of grouped) {
      const v = new Prisma.Decimal(row.total ?? '0');
      switch (row.type) {
        case 'ASSET':
          assets = assets.add(v);
          break;
        case 'LIABILITY':
          // Liabilities are credit-normal — their net is negative
          // when expressed as DR-CR. Flip sign so the check uses
          // the magnitude convention.
          liabilities = liabilities.sub(v);
          break;
        case 'EQUITY':
          equity = equity.sub(v);
          break;
        case 'REVENUE':
          revenue = revenue.sub(v);
          break;
        case 'EXPENSE':
          expense = expense.add(v);
          break;
        default:
          break;
      }
    }
    const equityWithPnl = equity.add(revenue).sub(expense);
    const lhs = assets;
    const rhs = liabilities.add(equityWithPnl);
    const delta = lhs.sub(rhs);
    const ok = delta.abs().lessThanOrEqualTo(TOLERANCE_KD);
    return {
      invariant: 'ASSETS_EQ_LIAB_PLUS_EQUITY',
      expectedKd: lhs.toFixed(4),
      actualKd: rhs.toFixed(4),
      deltaKd: delta.toFixed(4),
      ok,
      detail: ok
        ? `assets=${assets.toFixed(4)} liab=${liabilities.toFixed(4)} eq=${equityWithPnl.toFixed(4)}`
        : `BALANCE_SHEET_OUT_OF_BALANCE assets=${assets.toFixed(4)} liab=${liabilities.toFixed(4)} eq=${equityWithPnl.toFixed(4)}`,
    };
  }

  /**
   * Invariant 3 — Wallet Liability Match: Σ Journal WALLET_LIABILITY
   * (credit normal) == Σ CustomerWallet.balance.
   *
   * The journal's wallet liability is what we owe customers; the
   * wallet table's `balance` column is what the legacy app
   * tracks. They MUST agree to within tolerance — if they drift,
   * either a wallet write skipped the journal (the V20.3.4
   * subscription-cancel bug) or a journal write didn't update the
   * wallet (rare, would be a Phase 1 regression).
   */
  private async checkWalletLiabilityMatch(): Promise<ReconciliationResultRow> {
    const journalLines = await this.prisma.journalLine.findMany({
      where: { account: { code: JOURNAL_ACCOUNTS.WALLET_LIABILITY } },
      select: { debit: true, credit: true },
    });
    let journalLiability = new Prisma.Decimal(0);
    for (const l of journalLines) {
      journalLiability = journalLiability
        .add(new Prisma.Decimal(l.credit.toString()))
        .sub(new Prisma.Decimal(l.debit.toString()));
    }
    const walletAgg = await this.prisma.customerWallet.aggregate({
      _sum: { balance: true },
    });
    const walletBalance = new Prisma.Decimal(
      walletAgg._sum.balance?.toString() ?? '0',
    );
    const delta = journalLiability.sub(walletBalance);
    const ok = delta.abs().lessThanOrEqualTo(TOLERANCE_KD);
    return {
      invariant: 'WALLET_LIABILITY_MATCH',
      expectedKd: journalLiability.toFixed(4),
      actualKd: walletBalance.toFixed(4),
      deltaKd: delta.toFixed(4),
      ok,
      detail: ok ? undefined : 'WALLET_LIABILITY_DRIFT',
    };
  }

  /**
   * Invariant 4 — AR Integrity: Σ Journal AR (debit normal) ==
   * Σ open invoice remaining balances.
   *
   * Under V20.4 the journal AR IS the canonical receivable, so
   * any divergence from the legacy invoice-table view of "still
   * outstanding" is by definition phantom debt or a missing
   * issuance entry (a Phase 1 regression).
   */
  private async checkArIntegrity(): Promise<ReconciliationResultRow> {
    const arLines = await this.prisma.journalLine.findMany({
      where: { account: { code: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE } },
      select: { debit: true, credit: true },
    });
    let journalAr = new Prisma.Decimal(0);
    for (const l of arLines) {
      journalAr = journalAr
        .add(new Prisma.Decimal(l.debit.toString()))
        .sub(new Prisma.Decimal(l.credit.toString()));
    }
    // Σ remaining_balance over invoices still considered open by
    // the legacy view. Order-level Σ totalPrice for non-canceled,
    // unpaid orders is the closest projection in the current
    // schema; it is not partial-payment-aware (a partially-paid
    // invoice still shows the gross amount), so the AR_INTEGRITY
    // delta will sometimes report partial-payment drift as a
    // benign mismatch. The detail field carries the raw legacy
    // total so operators can quickly classify the cause.
    const fallback = await this.prisma.$queryRaw<Array<{ total: string }>>`
      SELECT COALESCE(SUM("totalPrice"), 0)::text AS total
      FROM "Order"
      WHERE "status" != 'CANCELED'
        AND "cashStatus" = 'UNPAID'
    `;
    const invoiceRemainingTotal = new Prisma.Decimal(
      fallback[0]?.total ?? '0',
    );
    const delta = journalAr.sub(invoiceRemainingTotal);
    const ok = delta.abs().lessThanOrEqualTo(TOLERANCE_KD);
    return {
      invariant: 'AR_INTEGRITY',
      expectedKd: journalAr.toFixed(4),
      actualKd: invoiceRemainingTotal.toFixed(4),
      deltaKd: delta.toFixed(4),
      ok,
      detail: ok ? undefined : 'AR_INVOICE_REMAINING_DRIFT',
    };
  }

  /**
   * Invariant 5 — Snapshot ↔ Ledger Match (V24 Station 1).
   *
   * Compares the V20.4 read-side projection against the live
   * journal AR account. The projection is the FE's "ask, don't
   * compute" source; if it drifts from the journal, every page
   * that pulls from `FinancialSnapshot.remainingDebtKd` is
   * silently lying.
   *
   * Expected: live journal AR (DR-CR on account 1300).
   * Actual:   Σ FinancialSnapshot.remainingDebtKd (the projector's
   *           per-customer canonical debt, summed).
   *
   * Drift causes (in order of frequency):
   *   - The 5-minute cron hasn't refreshed a stale row yet.
   *   - A debt-mutating commit didn't fire its post-commit
   *     `refreshOneInBackground` hook (event-bus regression).
   *   - The projector itself has a bug (rare — covered by
   *     `financial-snapshot.spec.ts`).
   *   - A customer was deleted but their journal lines remain.
   *
   * The detail field carries the snapshot row count so operators
   * can distinguish "missing snapshots" drift from "wrong
   * projection" drift at a glance.
   */
  private async checkSnapshotArMatch(): Promise<ReconciliationResultRow> {
    const arLines = await this.prisma.journalLine.findMany({
      where: { account: { code: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE } },
      select: { debit: true, credit: true },
    });
    let journalAr = new Prisma.Decimal(0);
    for (const l of arLines) {
      journalAr = journalAr
        .add(new Prisma.Decimal(l.debit.toString()))
        .sub(new Prisma.Decimal(l.credit.toString()));
    }
    const snapshotAgg = await this.prisma.financialSnapshot.aggregate({
      _sum: { remainingDebtKd: true },
      _count: { _all: true },
    });
    const snapshotTotal = new Prisma.Decimal(
      snapshotAgg._sum.remainingDebtKd?.toString() ?? '0',
    );
    const snapshotCount = snapshotAgg._count._all;
    const delta = journalAr.sub(snapshotTotal);
    const ok = delta.abs().lessThanOrEqualTo(TOLERANCE_KD);
    const baseDetail = `snapshotCount=${snapshotCount}`;
    return {
      invariant: 'SNAPSHOT_AR_MATCH',
      expectedKd: journalAr.toFixed(4),
      actualKd: snapshotTotal.toFixed(4),
      deltaKd: delta.toFixed(4),
      ok,
      detail: ok
        ? baseDetail
        : `SNAPSHOT_PROJECTION_DRIFT ${baseDetail}`,
    };
  }
}
