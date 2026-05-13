import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DoubleEntryJournalService,
  JOURNAL_ACCOUNTS,
} from '../../general-ledger/double-entry-journal.service';
import { PrismaService } from '../../prisma/prisma.service';
import { getCustomerDebtSnapshotTotalKd } from '../debt-customer-aggregates.util';

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

/**
 * حالة تدقيق العميل — نتيجة مقارنة رصيد المحفظة برصيد دفتر اليومية
 * Audit status for a single customer comparing wallet debt vs journal AR balance.
 */
export type AuditCustomerStatus =
  | 'OK'
  | 'DRIFT'
  | 'OVERPAYMENT'
  | 'DOUBLE_COUNT';

/**
 * صف تدقيق عميل واحد يوضح قيمة المحفظة ورصيد دفتر اليومية والانحراف
 * Single-customer audit row showing wallet debt, journal AR, and computed drift.
 */
export type AuditCustomerRow = {
  customerId: string;
  walletDebtKd: string;
  ledgerNetKd: string;
  driftKd: string;
  status: AuditCustomerStatus;
};

/**
 * استجابة نظرة عامة على التدقيق المالي مع الصفوف وملخص الإحصاءات
 * Financial audit overview response with per-customer rows and summary counts.
 */
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

/**
 * صف مدفوعات غير صالحة — (V20.4: مُزال، يُرجع دائماً مصفوفة فارغة)
 * Invalid payment row type — V20.4: DebtLedgerEntry removed; always returns empty array.
 */
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

/**
 * صف تسوية ثلاثي — يقارن رصيد دفتر الالتزام بدفتر اليومية ومحفظة العميل
 * Three-way reconciliation row comparing journal AR, wallet debt, and ledger net.
 */
export type ReconcileRow = {
  customerId: string;
  ledgerNetKd: string;
  journalArKd: string;
  walletDebtKd: string;
  deltaLedgerVsJournalKd: string;
  deltaLedgerVsWalletKd: string;
  status: 'OK' | 'DRIFT' | 'CRITICAL';
};

/**
 * استجابة التسوية ثلاثية الأبعاد مع الصفوف والملخص
 * Three-way reconciliation response with rows and summary counts.
 */
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

/**
 * صف إشارة احتيال — (V20.4: يُرجع دائماً مصفوفة فارغة بعد إزالة DebtLedgerEntry)
 * Fraud signal row — V20.4: always empty after DebtLedgerEntry removal.
 */
export type FraudSignalRow = {
  signal:
    | 'PAYMENT_EXCEEDS_INVOICES'
    | 'WALLET_PAYMENT_WITHOUT_ORDER'
    | 'REPEATED_AMOUNT_BURST';
  customerId: string;
  detail: Record<string, string | number | null>;
};

/**
 * صف ثابت عالمي — يتحقق من تناسق الميزانية العمومية للعميل
 * Global invariant check row for a single customer verifying LHS == RHS financial balance.
 */
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

/**
 * خدمة التدقيق المالي — تدقيق حقيقي الوقت لانحرافات المحافظ والتسوية والمخاطر
 * Real-time financial audit service powering the audit overview, reconciliation,
 * fraud signals, and global invariant checks. Read-only, no caching.
 *
 * @since V20.1-v3
 */
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

    // V25 perf — batch journal AR query (1 query for all customers).
    const journalArBatch = await this.journal.getCustomerBalancesBatch(
      wallets.map((w) => w.customerId),
    );

    for (const w of wallets) {
      try {
        // V20.4 — Journal AR is now the canonical source; DebtLedger removed.
        const journalArKd = journalArBatch.get(w.customerId) ?? new Prisma.Decimal(0);
        const walletDebtKd = await getCustomerDebtSnapshotTotalKd(
          this.prisma,
          w.customerId,
        );
        const driftKd = walletDebtKd.sub(journalArKd);
        const status = this.classify(walletDebtKd, journalArKd, driftKd);
        switch (status) {
          case 'OK':
            okCount += 1;
            break;
          case 'DRIFT':
            driftCount += 1;
            this.logger.warn(
              `[AUDIT_DRIFT] customerId=${w.customerId} walletDebt=${walletDebtKd.toFixed(4)} journalAr=${journalArKd.toFixed(4)} drift=${driftKd.toFixed(4)}`,
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
          ledgerNetKd: journalArKd.toFixed(4),
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
    void opts;
    // V20.4 — DebtLedgerEntry table removed; invalid-payment concept is moot.
    return { generatedAt: new Date().toISOString(), total: 0, rows: [] };
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
  /**
   * يُرجع عدد تنبيهات التدقيق المصنفة حسب النوع لعرض الشارات على لوحة المعلومات
   * Returns badge counts for each alert class without paginating the full customer book.
   * Heavier than getOverview — call sparingly (e.g. once per minute).
   *
   * @returns ملخص إحصاء التنبيهات | Alert count summary
   * @since V20.1-v3 Phase 6
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

    // V25 perf — batch journal AR query (1 query for all customers).
    const journalArBatchAlerts = await this.journal.getCustomerBalancesBatch(
      wallets.map((w) => w.customerId),
    );

    for (const w of wallets) {
      try {
        // V20.4 — Compare Journal AR vs wallet snapshot.
        const journalArKd = journalArBatchAlerts.get(w.customerId) ?? new Prisma.Decimal(0);
        const walletDebtKd = await getCustomerDebtSnapshotTotalKd(
          this.prisma,
          w.customerId,
        );
        const status = this.classify(
          walletDebtKd,
          journalArKd,
          walletDebtKd.sub(journalArKd),
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

    // V20.4 — DebtLedgerEntry removed; invalid-payment concept is moot.
    const invalidPayments = 0;
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
  // V20.4 — _isRealDebtLedgerPayment removed (DebtLedgerEntry table dropped).

  /**
   * V20.1-v4 — Phase 17 hard reconciliation endpoint.
   *
   * Three-way comparison: DebtLedger net, Journal AR balance,
   * CustomerWallet.debt. All three should agree within
   * {@link DRIFT_THRESHOLD}; any deviation is flagged. CRITICAL
   * is reserved for ledger-vs-wallet drift > 1.000 KD (a value
   * the operator definitely cares about).
   */
  /**
   * يُجري مقارنة ثلاثية بين دفتر الالتزام ودفتر اليومية ومحفظة العميل
   * Three-way comparison: ledger net vs journal AR vs CustomerWallet.debt.
   * CRITICAL reserved for wallet drift > 1.000 KD.
   *
   * @param opts.limit - عدد الصفوف لكل صفحة (افتراضي: 100، أقصى: 500) | Rows per page
   * @param opts.cursor - مؤشر الصفحة الأخير | Last customerId cursor
   * @returns استجابة التسوية ثلاثية الأبعاد | Three-way reconcile response
   * @since V20.1-v4 Phase 17
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

    // V25 perf — batch journal AR query (1 query for all customers).
    const journalArBatchReconcile = await this.journal.getCustomerBalancesBatch(
      wallets.map((w) => w.customerId),
    );

    for (const w of wallets) {
      try {
        // V20.4 — DebtLedger removed; reconcile is now Journal AR vs wallet.
        const journalAr = journalArBatchReconcile.get(w.customerId) ?? new Prisma.Decimal(0);
        const walletDebtKd = await getCustomerDebtSnapshotTotalKd(
          this.prisma,
          w.customerId,
        );
        const deltaJournalVsWallet = journalAr.sub(walletDebtKd);
        let status: ReconcileRow['status'] = 'OK';
        if (deltaJournalVsWallet.abs().greaterThan(DRIFT_THRESHOLD)) {
          status = deltaJournalVsWallet.abs().greaterThan(CRITICAL) ? 'CRITICAL' : 'DRIFT';
          this.logger.warn(
            `[RECONCILIATION_DRIFT] customerId=${w.customerId} journalAR=${journalAr.toFixed(4)} walletDebt=${walletDebtKd.toFixed(4)} delta=${deltaJournalVsWallet.toFixed(4)} status=${status}`,
          );
        }
        if (status === 'OK') okCount += 1;
        else if (status === 'DRIFT') driftCount += 1;
        else criticalCount += 1;
        rows.push({
          customerId: w.customerId,
          ledgerNetKd: journalAr.toFixed(4),
          journalArKd: journalAr.toFixed(4),
          walletDebtKd: walletDebtKd.toFixed(4),
          deltaLedgerVsJournalKd: '0.0000',
          deltaLedgerVsWalletKd: deltaJournalVsWallet.toFixed(4),
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
  /**
   * يكتشف إشارات الاحتيال المالي (V20.4: يُرجع دائماً مصفوفة فارغة)
   * Detects fraud signals (payment exceeds invoices, wallet payment without order,
   * repeated-amount burst). V20.4: always empty after DebtLedgerEntry removal.
   *
   * @param opts.limit - عدد الصفوف | Row limit
   * @returns إشارات الاحتيال المكتشفة | Detected fraud signal rows
   * @since V20.1-v4 Phase 23
   */
  async getFraudSignals(opts: {
    limit?: number;
  }): Promise<{ generatedAt: string; total: number; rows: FraudSignalRow[] }> {
    void opts;
    // V20.4 — All fraud signals relied on DebtLedgerEntry table which has been removed.
    // Future fraud detection should query JournalEntry/JournalLine directly.
    return { generatedAt: new Date().toISOString(), total: 0, rows: [] };
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
  /**
   * يتحقق من الثابت المالي العالمي لكل عميل (رصيد المحفظة == رصيد دفتر اليومية)
   * Checks the global invariant per customer: wallet.debt == journal AR (account 1300 net).
   * Detection-only — never throws.
   *
   * @param opts.limit - عدد الصفوف | Row limit (max 500)
   * @param opts.cursor - مؤشر الصفحة | Page cursor
   * @returns نتائج التحقق من الثابت العالمي | Global invariant check results
   * @since V20.1-v4 Phase 24
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

    // V20.4 — DebtLedger removed; invariant is now Journal AR vs wallet.debt.
    // LHS = wallet.debt, RHS = Journal AR (account 1300 net for customer).
    const rows: GlobalInvariantRow[] = [];

    // V25 perf — batch journal AR query (1 query for all customers).
    const journalArBatchInvariant = await this.journal
      .getCustomerBalancesBatch(wallets.map((w) => w.customerId))
      .catch(() => new Map<string, Prisma.Decimal>());

    for (const w of wallets) {
      const walletBalance = new Prisma.Decimal(w.balance.toString());
      const walletDebt = new Prisma.Decimal(w.debt.toString());
      const journalAr = journalArBatchInvariant.get(w.customerId) ?? new Prisma.Decimal(0);
      const drift = walletDebt.sub(journalAr);
      const ok = drift.abs().lessThanOrEqualTo(DRIFT_THRESHOLD);
      if (!ok) {
        this.logger.warn(
          `[GLOBAL_INVARIANT_VIOLATED] customerId=${w.customerId} walletDebt=${walletDebt.toFixed(4)} journalAr=${journalAr.toFixed(4)} drift=${drift.toFixed(4)}`,
        );
      }
      rows.push({
        customerId: w.customerId,
        walletBalanceKd: walletBalance.toFixed(4),
        totalPaymentsKd: '0.0000',
        totalDebtKd: walletDebt.toFixed(4),
        totalInvoicesKd: journalAr.toFixed(4),
        lhsKd: walletDebt.toFixed(4),
        rhsKd: journalAr.toFixed(4),
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
