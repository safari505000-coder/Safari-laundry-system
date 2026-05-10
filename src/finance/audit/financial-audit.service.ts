import { Injectable, Logger } from '@nestjs/common';
import { DebtSource, Prisma } from '@prisma/client';
import {
  DoubleEntryJournalService,
  JOURNAL_ACCOUNTS,
} from '../../general-ledger/double-entry-journal.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  getCustomerDebtSnapshotTotalKd,
  getCustomerNetDebtFromDebtLedgerOnly,
} from '../debt-customer-aggregates.util';
import {
  REAL_PAYMENT_SOURCE_REF_PREFIXES,
  WALLET_ABSORPTION_SOURCE_REF_PREFIXES,
  isRealDebtLedgerPayment,
} from '../debt-ledger-payment-origin.util';

/**
 * V20.1-v3 — Real-time financial audit service.
 *
 * Lightweight, read-only service that powers
 * `GET /finance/audit/overview` (and friends). Each call recomputes
 * from authoritative tables (`CustomerWallet`, `DebtLedgerEntry`)
 * with no caching — keeps it honest at the cost of a few extra
 * round trips. The overview endpoint is paginated (default 100,
 * max 500) so an operator can sweep the entire customer base
 * over a few requests when investigating drift.
 *
 * Intentionally separate from the daily {@link JournalDriftCron}
 * (which compares journal vs ledger) — this service compares
 * `CustomerWallet.debt` vs `DebtLedgerEntry` net, which is the
 * front-end-visible drift the v3 prompt cares about.
 */

export type AuditCustomerStatus =
  | 'OK'
  | 'DRIFT'
  | 'OVERPAYMENT'
  | 'DOUBLE_COUNT';

export type AuditCustomerRow = {
  customerId: string;
  walletDebtKd: string;
  ledgerNetKd: string;
  driftKd: string;
  status: AuditCustomerStatus;
};

export type AuditOverviewResponse = {
  generatedAt: string;
  total: number;
  cursor: string | null;
  rows: AuditCustomerRow[];
  summary: {
    okCount: number;
    driftCount: number;
    overpaymentCount: number;
    doubleCountCount: number;
    sumDriftKdAbs: string;
  };
};

export type InvalidPaymentRow = {
  id: string;
  customerId: string;
  orderId: string | null;
  amount: string;
  sourceRef: string | null;
  actorUserId: string | null;
  reason:
    | 'NO_ACTOR'
    | 'NO_SOURCE_REF'
    | 'NON_POSITIVE_AMOUNT'
    | 'UNKNOWN_PREFIX';
  createdAt: string;
};

const DRIFT_THRESHOLD = new Prisma.Decimal('0.001');

export type ReconcileRow = {
  customerId: string;
  ledgerNetKd: string;
  journalArKd: string;
  walletDebtKd: string;
  deltaLedgerVsJournalKd: string;
  deltaLedgerVsWalletKd: string;
  status: 'OK' | 'DRIFT' | 'CRITICAL';
};

export type ReconcileResponse = {
  generatedAt: string;
  total: number;
  cursor: string | null;
  rows: ReconcileRow[];
  summary: {
    okCount: number;
    driftCount: number;
    criticalCount: number;
  };
};

export type FraudSignalRow = {
  signal:
    | 'PAYMENT_EXCEEDS_INVOICES'
    | 'WALLET_PAYMENT_WITHOUT_ORDER'
    | 'REPEATED_AMOUNT_BURST';
  customerId: string;
  detail: Record<string, string | number | null>;
};

export type GlobalInvariantRow = {
  customerId: string;
  walletBalanceKd: string;
  totalPaymentsKd: string;
  totalDebtKd: string;
  totalInvoicesKd: string;
  lhsKd: string;
  rhsKd: string;
  driftKd: string;
  ok: boolean;
};

@Injectable()
export class FinancialAuditService {
  private readonly logger = new Logger(FinancialAuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: DoubleEntryJournalService,
  ) {}

  /**
   * Per-customer drift overview.
   *
   * @param limit max rows to return (default 100, max 500)
   * @param cursor opaque cursor (last customerId from previous page)
   */
  async getOverview(opts: {
    limit?: number;
    cursor?: string | null;
  }): Promise<AuditOverviewResponse> {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
    const cursorClause = opts.cursor?.trim()
      ? { id: { gt: opts.cursor.trim() } }
      : {};

    const wallets = await this.prisma.customerWallet.findMany({
      where: cursorClause,
      orderBy: { id: 'asc' },
      take: limit,
      select: {
        customerId: true,
        debt: true,
        balance: true,
      },
    });

    const rows: AuditCustomerRow[] = [];
    let okCount = 0;
    let driftCount = 0;
    let overpaymentCount = 0;
    let doubleCountCount = 0;
    let sumAbsDrift = new Prisma.Decimal(0);

    for (const w of wallets) {
      try {
        const ledger = await getCustomerNetDebtFromDebtLedgerOnly(
          this.prisma,
          w.customerId,
        );
        const walletDebtKd = await getCustomerDebtSnapshotTotalKd(
          this.prisma,
          w.customerId,
        );
        const ledgerNetKd = ledger.netOpenDebtKd;
        const driftKd = walletDebtKd.sub(ledgerNetKd);
        const status = this.classify(walletDebtKd, ledgerNetKd, driftKd);
        switch (status) {
          case 'OK':
            okCount += 1;
            break;
          case 'DRIFT':
            driftCount += 1;
            this.logger.warn(
              `[AUDIT_DRIFT] customerId=${w.customerId} walletDebt=${walletDebtKd.toFixed(4)} ledgerNet=${ledgerNetKd.toFixed(4)} drift=${driftKd.toFixed(4)}`,
            );
            break;
          case 'OVERPAYMENT':
            overpaymentCount += 1;
            break;
          case 'DOUBLE_COUNT':
            doubleCountCount += 1;
            break;
        }
        sumAbsDrift = sumAbsDrift.add(driftKd.abs());
        rows.push({
          customerId: w.customerId,
          walletDebtKd: walletDebtKd.toFixed(4),
          ledgerNetKd: ledgerNetKd.toFixed(4),
          driftKd: driftKd.toFixed(4),
          status,
        });
      } catch (err) {
        this.logger.error(
          `[AUDIT_OVERVIEW_ROW_FAILED] customerId=${w.customerId} err=${(err as Error).message}`,
        );
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      total: rows.length,
      cursor: rows.length === limit ? wallets[wallets.length - 1].customerId : null,
      rows,
      summary: {
        okCount,
        driftCount,
        overpaymentCount,
        doubleCountCount,
        sumDriftKdAbs: sumAbsDrift.toFixed(4),
      },
    };
  }

  /**
   * V20.1-v3 — Phase 7 invalid PAYMENT detector.
   *
   * Surfaces DebtLedgerEntry PAYMENT rows that violate the v2
   * write contract: missing actorUserId, missing sourceRef, or
   * non-positive amount. Also flags rows whose sourceRef does
   * not start with any whitelisted prefix (potential silent
   * data corruption from a legacy or compromised write site).
   *
   * Read-only. The rows are NOT modified — investigation only.
   */
  async getInvalidPayments(opts: {
    limit?: number;
  }): Promise<{ generatedAt: string; total: number; rows: InvalidPaymentRow[] }> {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
    const rawRows = await this.prisma.debtLedgerEntry.findMany({
      where: {
        source: DebtSource.PAYMENT,
        OR: [
          { actorUserId: null },
          { sourceRef: null },
          { amount: { lte: new Prisma.Decimal(0) } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        customerId: true,
        orderId: true,
        amount: true,
        sourceRef: true,
        actorUserId: true,
        createdAt: true,
      },
    });

    const allowed = [
      ...REAL_PAYMENT_SOURCE_REF_PREFIXES,
      ...WALLET_ABSORPTION_SOURCE_REF_PREFIXES,
    ];

    const rows: InvalidPaymentRow[] = rawRows.map((r) => {
      let reason: InvalidPaymentRow['reason'];
      if (!r.actorUserId) reason = 'NO_ACTOR';
      else if (!r.sourceRef) reason = 'NO_SOURCE_REF';
      else if (new Prisma.Decimal(r.amount.toString()).lessThanOrEqualTo(0))
        reason = 'NON_POSITIVE_AMOUNT';
      else if (!allowed.some((p) => r.sourceRef!.startsWith(p)))
        reason = 'UNKNOWN_PREFIX';
      else reason = 'NO_ACTOR'; // shouldn't happen but keeps type total
      this.logger.warn(
        `[INVALID_PAYMENT] id=${r.id} reason=${reason} customerId=${r.customerId} sourceRef=${r.sourceRef ?? 'NULL'} amount=${r.amount.toString()}`,
      );
      return {
        id: r.id,
        customerId: r.customerId,
        orderId: r.orderId,
        amount: r.amount.toString(),
        sourceRef: r.sourceRef ?? null,
        actorUserId: r.actorUserId ?? null,
        reason,
        createdAt: r.createdAt.toISOString(),
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      total: rows.length,
      rows,
    };
  }

  /**
   * V20.1-v3 — Phase 6 alerts feed.
   *
   * Convenience aggregator: returns the count of every alert
   * class so the dashboard can render badges without paginating.
   * Heavier than `getOverview` because it walks the entire
   * customer book — call sparingly (e.g. once per minute on the
   * dashboard, not per UI render).
   */
  async getAlertsSummary(): Promise<{
    generatedAt: string;
    driftCount: number;
    overpaymentCount: number;
    doubleCountCount: number;
    invalidPaymentCount: number;
    missingWalletPaymentCount: number;
  }> {
    const wallets = await this.prisma.customerWallet.findMany({
      select: { customerId: true },
    });
    let drift = 0;
    let over = 0;
    let dc = 0;
    for (const w of wallets) {
      try {
        const ledger = await getCustomerNetDebtFromDebtLedgerOnly(
          this.prisma,
          w.customerId,
        );
        const walletDebtKd = await getCustomerDebtSnapshotTotalKd(
          this.prisma,
          w.customerId,
        );
        const status = this.classify(
          walletDebtKd,
          ledger.netOpenDebtKd,
          walletDebtKd.sub(ledger.netOpenDebtKd),
        );
        if (status === 'DRIFT') drift += 1;
        else if (status === 'OVERPAYMENT') over += 1;
        else if (status === 'DOUBLE_COUNT') dc += 1;
      } catch (err) {
        this.logger.error(
          `[AUDIT_ALERTS_ROW_FAILED] customerId=${w.customerId} err=${(err as Error).message}`,
        );
      }
    }

    const invalidPayments = await this.prisma.debtLedgerEntry.count({
      where: {
        source: DebtSource.PAYMENT,
        OR: [
          { actorUserId: null },
          { sourceRef: null },
          { amount: { lte: new Prisma.Decimal(0) } },
        ],
      },
    });
    const missingWalletPayments = await this.countOrdersWithWalletDeductionMissingPayment();

    return {
      generatedAt: new Date().toISOString(),
      driftCount: drift,
      overpaymentCount: over,
      doubleCountCount: dc,
      invalidPaymentCount: invalidPayments,
      missingWalletPaymentCount: missingWalletPayments,
    };
  }

  /**
   * V20.1-v3 — Phase 1/3 missing-PAYMENT counter.
   *
   * Counts orders where TransactionHistory recorded a positive
   * `metadata.appliedFromWallet` but no matching `PAYMENT:WALLET:`
   * row exists in DebtLedgerEntry. This is the gauge that should
   * tend toward zero as the backfill script runs.
   *
   * Implemented via raw SQL to avoid pulling all wallet-applied
   * TH rows into Node memory.
   */
  private async countOrdersWithWalletDeductionMissingPayment(): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT th."orderId")::bigint AS count
      FROM "TransactionHistory" th
      WHERE th."type" = 'ORDER_WALLET_SETTLEMENT'
        AND th."orderId" IS NOT NULL
        AND COALESCE((th."metadata" ->> 'appliedFromWallet')::numeric, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM "DebtLedgerEntry" dle
          WHERE dle."orderId" = th."orderId"
            AND dle."source" = 'PAYMENT'
            AND dle."sourceRef" LIKE 'PAYMENT:WALLET:%'
        )
    `;
    return Number(rows[0]?.count ?? 0n);
  }

  private classify(
    walletDebtKd: Prisma.Decimal,
    ledgerNetKd: Prisma.Decimal,
    driftKd: Prisma.Decimal,
  ): AuditCustomerStatus {
    if (driftKd.abs().greaterThan(DRIFT_THRESHOLD)) {
      if (ledgerNetKd.lessThan(0)) return 'OVERPAYMENT';
      if (walletDebtKd.greaterThan(ledgerNetKd)) return 'DOUBLE_COUNT';
      return 'DRIFT';
    }
    if (ledgerNetKd.lessThan(0)) return 'OVERPAYMENT';
    return 'OK';
  }

  // Re-export for tests / external typing convenience.
  static readonly DRIFT_THRESHOLD_KD = '0.001';
  static readonly _isRealDebtLedgerPayment = isRealDebtLedgerPayment;

  /**
   * V20.1-v4 — Phase 17 hard reconciliation endpoint.
   *
   * Three-way comparison: DebtLedger net, Journal AR balance,
   * CustomerWallet.debt. All three should agree within
   * {@link DRIFT_THRESHOLD}; any deviation is flagged. CRITICAL
   * is reserved for ledger-vs-wallet drift > 1.000 KD (a value
   * the operator definitely cares about).
   */
  async getReconcile(opts: {
    limit?: number;
    cursor?: string | null;
  }): Promise<ReconcileResponse> {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
    const cursorClause = opts.cursor?.trim()
      ? { id: { gt: opts.cursor.trim() } }
      : {};
    const wallets = await this.prisma.customerWallet.findMany({
      where: cursorClause,
      orderBy: { id: 'asc' },
      take: limit,
      select: { customerId: true },
    });

    const rows: ReconcileRow[] = [];
    let okCount = 0;
    let driftCount = 0;
    let criticalCount = 0;
    const CRITICAL = new Prisma.Decimal('1.0000');

    for (const w of wallets) {
      try {
        const ledger = await getCustomerNetDebtFromDebtLedgerOnly(
          this.prisma,
          w.customerId,
        );
        const walletDebtKd = await getCustomerDebtSnapshotTotalKd(
          this.prisma,
          w.customerId,
        );
        const journalAr = await this.journal.getCustomerBalanceFromJournal(
          w.customerId,
        );
        const ledgerNet = ledger.netOpenDebtKd;
        const deltaLedgerVsJournal = ledgerNet.sub(journalAr);
        const deltaLedgerVsWallet = ledgerNet.sub(walletDebtKd);
        let status: ReconcileRow['status'] = 'OK';
        if (
          deltaLedgerVsJournal.abs().greaterThan(DRIFT_THRESHOLD) ||
          deltaLedgerVsWallet.abs().greaterThan(DRIFT_THRESHOLD)
        ) {
          status = deltaLedgerVsWallet.abs().greaterThan(CRITICAL)
            ? 'CRITICAL'
            : 'DRIFT';
          this.logger.warn(
            `[RECONCILIATION_DRIFT] customerId=${w.customerId} ledgerNet=${ledgerNet.toFixed(4)} journalAR=${journalAr.toFixed(4)} walletDebt=${walletDebtKd.toFixed(4)} deltaLJ=${deltaLedgerVsJournal.toFixed(4)} deltaLW=${deltaLedgerVsWallet.toFixed(4)} status=${status}`,
          );
        }
        if (status === 'OK') okCount += 1;
        else if (status === 'DRIFT') driftCount += 1;
        else criticalCount += 1;
        rows.push({
          customerId: w.customerId,
          ledgerNetKd: ledgerNet.toFixed(4),
          journalArKd: journalAr.toFixed(4),
          walletDebtKd: walletDebtKd.toFixed(4),
          deltaLedgerVsJournalKd: deltaLedgerVsJournal.toFixed(4),
          deltaLedgerVsWalletKd: deltaLedgerVsWallet.toFixed(4),
          status,
        });
      } catch (err) {
        this.logger.error(
          `[RECONCILIATION_ROW_FAILED] customerId=${w.customerId} err=${(err as Error).message}`,
        );
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      total: rows.length,
      cursor:
        rows.length === limit ? wallets[wallets.length - 1].customerId : null,
      rows,
      summary: { okCount, driftCount, criticalCount },
    };
  }

  /**
   * V20.1-v4 — Phase 23 fraud signals.
   *
   * Detection-only. Three orthogonal signals:
   *   1) PAYMENT_EXCEEDS_INVOICES — total real PAYMENT > total
   *      INVOICE_SHORTFALL+SUBSCRIPTION_OVERUSE for the customer.
   *   2) WALLET_PAYMENT_WITHOUT_ORDER — `PAYMENT:WALLET:` row with
   *      orderId IS NULL (should never happen — the live path
   *      always sets orderId).
   *   3) REPEATED_AMOUNT_BURST — same exact PAYMENT amount written
   *      to the same customer ≥ 5 times within 60 seconds (likely
   *      retry-storm or scripted exfiltration).
   *
   * Each signal emits `[FRAUD_ALERT]` log line.
   */
  async getFraudSignals(opts: {
    limit?: number;
  }): Promise<{ generatedAt: string; total: number; rows: FraudSignalRow[] }> {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
    const out: FraudSignalRow[] = [];

    // Signal 2 — wallet PAYMENT without orderId
    const orphans = await this.prisma.debtLedgerEntry.findMany({
      where: {
        source: DebtSource.PAYMENT,
        sourceRef: { startsWith: 'PAYMENT:WALLET:' },
        orderId: null,
      },
      take: limit,
      select: { id: true, customerId: true, amount: true, sourceRef: true },
    });
    for (const o of orphans) {
      out.push({
        signal: 'WALLET_PAYMENT_WITHOUT_ORDER',
        customerId: o.customerId,
        detail: {
          debtLedgerEntryId: o.id,
          amountKd: o.amount.toString(),
          sourceRef: o.sourceRef,
        },
      });
      this.logger.warn(
        `[FRAUD_ALERT] WALLET_PAYMENT_WITHOUT_ORDER id=${o.id} customerId=${o.customerId}`,
      );
    }

    // Signal 1 — PAYMENT > invoices per customer (single SQL pass)
    if (out.length < limit) {
      const overpayRows = await this.prisma.$queryRaw<
        { customerId: string; payments: string; invoices: string }[]
      >`
        SELECT
          dle."customerId" AS "customerId",
          COALESCE(SUM(CASE WHEN dle."source" = 'PAYMENT' AND dle."sourceRef" NOT LIKE 'PAYMENT:WALLET:%' THEN dle."amount" ELSE 0 END), 0)::text AS payments,
          COALESCE(SUM(CASE WHEN dle."source" IN ('INVOICE_SHORTFALL', 'SUBSCRIPTION_OVERUSE') THEN dle."amount" ELSE 0 END), 0)::text AS invoices
        FROM "DebtLedgerEntry" dle
        GROUP BY dle."customerId"
        HAVING COALESCE(SUM(CASE WHEN dle."source" = 'PAYMENT' AND dle."sourceRef" NOT LIKE 'PAYMENT:WALLET:%' THEN dle."amount" ELSE 0 END), 0)
             > COALESCE(SUM(CASE WHEN dle."source" IN ('INVOICE_SHORTFALL', 'SUBSCRIPTION_OVERUSE') THEN dle."amount" ELSE 0 END), 0)
        LIMIT ${limit - out.length}
      `;
      for (const r of overpayRows) {
        out.push({
          signal: 'PAYMENT_EXCEEDS_INVOICES',
          customerId: r.customerId,
          detail: { paymentsKd: r.payments, invoicesKd: r.invoices },
        });
        this.logger.warn(
          `[FRAUD_ALERT] PAYMENT_EXCEEDS_INVOICES customerId=${r.customerId} paymentsKd=${r.payments} invoicesKd=${r.invoices}`,
        );
      }
    }

    // Signal 3 — same amount ≥5 times in 60s for the same customer
    if (out.length < limit) {
      const burst = await this.prisma.$queryRaw<
        { customerId: string; amount: string; count: bigint; bucketStart: Date }[]
      >`
        SELECT
          dle."customerId" AS "customerId",
          dle."amount"::text AS amount,
          COUNT(*)::bigint AS count,
          date_trunc('minute', dle."createdAt") AS "bucketStart"
        FROM "DebtLedgerEntry" dle
        WHERE dle."source" = 'PAYMENT'
          AND dle."createdAt" >= NOW() - INTERVAL '7 days'
        GROUP BY dle."customerId", dle."amount", date_trunc('minute', dle."createdAt")
        HAVING COUNT(*) >= 5
        LIMIT ${limit - out.length}
      `;
      for (const b of burst) {
        out.push({
          signal: 'REPEATED_AMOUNT_BURST',
          customerId: b.customerId,
          detail: {
            amountKd: b.amount,
            countWithinBucket: Number(b.count),
            bucketStart: b.bucketStart.toISOString(),
          },
        });
        this.logger.warn(
          `[FRAUD_ALERT] REPEATED_AMOUNT_BURST customerId=${b.customerId} amount=${b.amount} count=${b.count} bucket=${b.bucketStart.toISOString()}`,
        );
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      total: out.length,
      rows: out,
    };
  }

  /**
   * V20.1-v4 — Phase 24 global invariant check.
   *
   * Computes for each customer:
   *   LHS = walletBalance + totalPayments + totalDebt
   *   RHS = totalInvoices
   * (rearranged from the prompt's `walletBalance + totalPayments
   *  = totalInvoices - totalDebt`).
   *
   * `totalPayments` here INCLUDES wallet-absorption rows because
   * those represent money that closed an invoice (wallet credit
   * → revenue). `totalInvoices` is summed from DebtLedgerEntry
   * SHORTFALL+OVERUSE; orders fully paid in cash with no shortfall
   * never produce DebtLedger rows and so contribute 0 to both
   * sides (vacuously satisfied).
   *
   * Detection-only — never throws. Use the result to triage.
   */
  async checkGlobalInvariant(opts: {
    limit?: number;
    cursor?: string | null;
  }): Promise<{
    generatedAt: string;
    total: number;
    cursor: string | null;
    rows: GlobalInvariantRow[];
  }> {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
    const cursorClause = opts.cursor?.trim()
      ? { id: { gt: opts.cursor.trim() } }
      : {};
    const wallets = await this.prisma.customerWallet.findMany({
      where: cursorClause,
      orderBy: { id: 'asc' },
      take: limit,
      select: { customerId: true, balance: true, debt: true },
    });

    const rows: GlobalInvariantRow[] = [];
    for (const w of wallets) {
      const dleRows = await this.prisma.debtLedgerEntry.findMany({
        where: { customerId: w.customerId },
        select: { source: true, amount: true, sourceRef: true },
      });
      let invoices = new Prisma.Decimal(0);
      let payments = new Prisma.Decimal(0);
      for (const r of dleRows) {
        const amt = new Prisma.Decimal(r.amount.toString());
        if (
          r.source === DebtSource.INVOICE_SHORTFALL ||
          r.source === DebtSource.SUBSCRIPTION_OVERUSE
        ) {
          invoices = invoices.add(amt);
        } else if (r.source === DebtSource.PAYMENT) {
          payments = payments.add(amt); // INCLUDES wallet absorption
        }
      }
      const walletBalance = new Prisma.Decimal(w.balance.toString());
      const walletDebt = new Prisma.Decimal(w.debt.toString());
      const lhs = walletBalance.add(payments).add(walletDebt);
      const rhs = invoices;
      const drift = lhs.sub(rhs);
      const ok = drift.abs().lessThanOrEqualTo(DRIFT_THRESHOLD);
      if (!ok) {
        this.logger.warn(
          `[GLOBAL_INVARIANT_VIOLATED] customerId=${w.customerId} lhs=${lhs.toFixed(4)} rhs=${rhs.toFixed(4)} drift=${drift.toFixed(4)}`,
        );
      }
      rows.push({
        customerId: w.customerId,
        walletBalanceKd: walletBalance.toFixed(4),
        totalPaymentsKd: payments.toFixed(4),
        totalDebtKd: walletDebt.toFixed(4),
        totalInvoicesKd: invoices.toFixed(4),
        lhsKd: lhs.toFixed(4),
        rhsKd: rhs.toFixed(4),
        driftKd: drift.toFixed(4),
        ok,
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      total: rows.length,
      cursor:
        rows.length === limit ? wallets[wallets.length - 1].customerId : null,
      rows,
    };
  }
}
