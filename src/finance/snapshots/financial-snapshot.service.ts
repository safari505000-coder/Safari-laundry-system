import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  CashStatus,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JournalSourceService } from '../../general-ledger/journal-source.service';
import {
  computeCanonicalCustomerDebt,
  type CanonicalDebtSnapshot,
} from '../canonical-customer-debt.util';
import {
  computeOrderRemainingBalancesBatch,
  INVOICE_REMAINING_TOLERANCE_KD,
  isV20_3TrueAccountingEnabled,
} from '../debt-customer-aggregates.util';
import { FinancialSnapshotRepository } from './financial-snapshot.repository';
import {
  type FinancialSnapshotInput,
  type FinancialSnapshotRow,
  type SnapshotRefreshSource,
} from './financial-snapshot.types';
import { AgingService } from '../aging/aging.service';
import { RiskScoringService } from '../risk/risk-scoring.service';

/**
 * V20.4 — Phase 1 / Phase 4 deterministic projection service.
 *
 * Reads from financial PRIMARIES only (Journal, DebtLedger, Order,
 * CustomerWallet) and writes the derived row into
 * `FinancialSnapshot`. The mapping is pure: same primaries → same
 * snapshot row, every time. That's the rebuild guarantee — drop
 * `FinancialSnapshot` entirely, run {@link rebuildAll}, and the
 * read side returns identical numbers.
 *
 * The service is consumed in three places:
 *   1. {@link refreshOne} — domain-event listeners call this after
 *      a debt-mutating commit (PAYMENT_CAPTURED, WALLET_ABSORBED,
 *      INVOICE_ISSUED, …). Fire-and-forget pattern keeps the
 *      financial write-path latency unaffected.
 *   2. {@link rebuildStale} — `FinancialSnapshotCron` runs every
 *      5 minutes and refreshes any row whose `refreshedAt` is
 *      older than the staleness window OR whose `schemaVersion`
 *      is below the current projector. This catches any miss
 *      from the event hooks (process restarts, dropped events,
 *      out-of-band writes) without any operator action.
 *   3. {@link rebuildAll} — manual / backfill rebuild that walks
 *      the entire customer book in pages.
 *
 * Failures are non-fatal: every public method swallows per-customer
 * errors with a `[FINANCIAL_SNAPSHOT_FAILURE]` warn log. The next
 * cron sweep retries automatically.
 */

const TOL = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);

/**
 * خدمة اللقطة المالية — تُوّلد وتُحدّث الصورة الكانونية لديون كل عميل
 * Deterministic projection service that reads from financial primaries
 * (Journal, Order, CustomerWallet) and persists derived rows into FinancialSnapshot.
 * Same primaries always produce the same snapshot row (rebuild guarantee).
 * Failures are non-fatal — the 5-minute cron retries automatically.
 *
 * @since V20.4 Phase 1/4
 */
@Injectable()
export class FinancialSnapshotService {
  private readonly logger = new Logger(FinancialSnapshotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly journalSource: JournalSourceService,
    private readonly repo: FinancialSnapshotRepository,
    // V20.5 — Phase 7 optional dependencies. The snapshot module
    // can boot without them (e.g. in unit tests that only exercise
    // the V20.4 fields); when present the projector materialises
    // agingBucket / riskLevel / collectionsStage from the new
    // engines.
    @Optional() private readonly aging?: AgingService,
    @Optional() private readonly risk?: RiskScoringService,
  ) {}

  /**
   * Public read accessor — Subscribers / Outstanding /
   * `DebtVisibilityService` go through this so a missing
   * projection row triggers a synchronous build instead of
   * returning silent zeros.
   */
  async getOrBuildForCustomer(
    customerId: string,
    source: SnapshotRefreshSource = 'CRON_RECONCILE',
  ): Promise<FinancialSnapshotRow> {
    const existing = await this.repo.findByCustomerId(customerId);
    if (existing) return existing;
    return this.refreshOne(customerId, source);
  }

  /**
   * Batch read accessor for paginated APIs (Subscribers list,
   * Outstanding). Missing rows are NOT auto-built — we don't
   * want a single cold-start customer to serialise the whole
   * page behind a synchronous projection. Callers that find a
   * missing row should fan out to the live computation
   * fallback in {@link DebtVisibilityService}.
   */
  /**
   * يُرجع لقطات مالية موجودة لمجموعة من معرفات العملاء دون إنشاء لقطات جديدة
   * Batch read accessor — returns existing snapshot rows for the given customer IDs.
   * Missing rows are NOT auto-built to avoid serialising paginated APIs.
   *
   * @param customerIds - قائمة معرفات العملاء | List of customer IDs
   * @returns خريطة من معرف العميل إلى صف اللقطة | Map of customerId to snapshot row
   */
  async findExistingByCustomerIds(
    customerIds: string[],
  ): Promise<Map<string, FinancialSnapshotRow>> {
    return this.repo.findManyByCustomerIds(customerIds);
  }

  /**
   * Project + persist for one customer. Awaits the inputs, runs
   * the canonical helper for `remainingDebtKd`, and upserts.
   *
   * Caller passes the {@link SnapshotRefreshSource} so the
   * projection row's `refreshContext.source` reflects what
   * triggered the refresh (event, cron, manual rebuild, …).
   */
  /**
   * يُجدّد لقطة عميل واحد ويحفظها في قاعدة البيانات
   * Projects and persists the snapshot for a single customer.
   * Re-throws on error so event-hook callers can fall back to live computation.
   *
   * @param customerId - معرف العميل | Customer ID
   * @param source - مصدر التحديث (حدث، cron، يدوي) | Refresh trigger source
   * @param correlationId - معرف الارتباط للتتبع (اختياري) | Optional correlation ID
   * @returns صف اللقطة المحدّث | Updated snapshot row
   */
  async refreshOne(
    customerId: string,
    source: SnapshotRefreshSource,
    correlationId?: string | null,
  ): Promise<FinancialSnapshotRow> {
    try {
      const input = await this.computeSnapshotInput(customerId);
      return await this.repo.upsert(input, source, correlationId ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[FINANCIAL_SNAPSHOT_FAILURE] customerId=${customerId} source=${source} correlationId=${correlationId ?? '-'} message=${message}`,
      );
      // Re-throw so callers awaiting an immediate read can fall
      // back to live computation; the fire-and-forget event hook
      // wraps in its own catch.
      throw err;
    }
  }

  /**
   * Fire-and-forget wrapper for domain-event listeners and
   * post-commit hooks that don't block on the projection write.
   * Logs failures but never propagates them — the next cron
   * sweep will reconcile.
   */
  /**
   * يُجدّد لقطة عميل في الخلفية دون انتظار النتيجة
   * Fire-and-forget wrapper for event listeners and post-commit hooks.
   * Logs failures but never propagates them.
   *
   * @param customerId - معرف العميل | Customer ID
   * @param source - مصدر التحديث | Refresh trigger source
   * @param correlationId - معرف الارتباط (اختياري) | Optional correlation ID
   */
  refreshOneInBackground(
    customerId: string,
    source: SnapshotRefreshSource,
    correlationId?: string | null,
  ): void {
    void this.refreshOne(customerId, source, correlationId).catch(
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[FINANCIAL_SNAPSHOT_BG_FAILURE] customerId=${customerId} source=${source} message=${message}`,
        );
      },
    );
  }

  /**
   * Cron-driven page of stale rows. Returns the number of rows
   * refreshed so the cron can log "throughput per cycle".
   */
  /**
   * يُعيد بناء صفوف اللقطات القديمة أو المفقودة بشكل تدريجي
   * Cron-driven page refresh of stale or missing snapshot rows.
   *
   * @param opts.staleAfter - حد القِدَم للصفوف المستهدفة | Staleness threshold date
   * @param opts.limit - عدد الصفوف في الدورة الواحدة | Rows per cron cycle
   * @param opts.source - مصدر التحديث | Refresh source label
   * @returns عدد الصفوف المُحدَّثة في هذه الدورة | Count of rows refreshed in this cycle
   */
  async rebuildStale(opts: {
    staleAfter: Date;
    limit: number;
    source?: SnapshotRefreshSource;
  }): Promise<number> {
    const ids = await this.repo.findStaleCustomerIds({
      staleAfter: opts.staleAfter,
      limit: opts.limit,
    });
    if (ids.length === 0) {
      // Backfill any customers without a projection row at all.
      const missing = await this.repo.findCustomersWithoutSnapshot(opts.limit);
      ids.push(...missing);
    }
    let refreshed = 0;
    for (const id of ids) {
      try {
        await this.refreshOne(id, opts.source ?? 'CRON_RECONCILE');
        refreshed += 1;
      } catch {
        // refreshOne already logs; keep sweeping.
      }
    }
    return refreshed;
  }

  /**
   * Drop-and-rebuild walk over the entire customer book. Used by
   * `scripts/rebuild-financial-snapshots.ts` and after a projector
   * version bump. Page size defaults to 200 to keep transactions
   * short; the operator can scale up via the parameter.
   */
  /**
   * يُعيد بناء جميع لقطات العملاء من الصفر بشكل صفحي
   * Full drop-and-rebuild walk over the entire customer book.
   * Used after projector version bumps or manual backfill.
   *
   * @param opts.pageSize - حجم الصفحة (افتراضي: 200، أقصى: 1000) | Page size
   * @param opts.source - مصدر إعادة البناء | Rebuild source label
   * @returns إحصاء عمليات الفحص والتحديث والفشل | Scan/refreshed/failed counts
   */
  async rebuildAll(opts?: {
    pageSize?: number;
    source?: SnapshotRefreshSource;
  }): Promise<{ scanned: number; refreshed: number; failed: number }> {
    const pageSize = Math.max(1, Math.min(opts?.pageSize ?? 200, 1000));
    const source = opts?.source ?? 'MANUAL_REBUILD';
    let cursor: string | null = null;
    let scanned = 0;
    let refreshed = 0;
    let failed = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const where: Prisma.CustomerWhereInput = cursor
        ? { id: { gt: cursor } }
        : {};
      const page = await this.prisma.customer.findMany({
        where,
        orderBy: { id: 'asc' },
        take: pageSize,
        select: { id: true },
      });
      if (page.length === 0) break;
      for (const c of page) {
        scanned += 1;
        try {
          await this.refreshOne(c.id, source);
          refreshed += 1;
        } catch {
          failed += 1;
        }
      }
      cursor = page[page.length - 1].id;
      if (page.length < pageSize) break;
    }
    return { scanned, refreshed, failed };
  }

  /**
   * Pure mapper: primaries → snapshot input. Exposed so unit tests
   * can call it without going through the repository.
   */
  /**
   * يحسب مدخلات اللقطة المالية للعميل من المصادر الأولية
   * Pure mapper computing the full FinancialSnapshotInput from primaries.
   * Exposed for unit testing without going through the repository.
   *
   * @param customerId - معرف العميل | Customer ID
   * @returns مدخلات اللقطة المالية الكاملة | Full snapshot input object
   */
  async computeSnapshotInput(
    customerId: string,
  ): Promise<FinancialSnapshotInput> {
    const [
      canonical,
      walletRow,
      invoiceAggregates,
      lastPaymentRow,
    ] = await Promise.all([
      computeCanonicalCustomerDebt(this.prisma, this.journalSource, customerId),
      this.prisma.customerWallet.findUnique({
        where: { customerId },
        select: { balance: true },
      }),
      this.computeInvoiceAggregates(customerId, undefined, undefined),
      this.findLastRealPaymentAt(customerId),
    ]);

    const journalArBalanceKd = await this.journalSource
      .getCustomerDebtFromJournalAR(customerId)
      .catch(() => new Prisma.Decimal(0));

    const walletLiability = await this.computeWalletLiability(customerId);

    // V20.5 — Phase 7 derived projections. All wrapped in
    // try/catch so any new-engine error degrades gracefully to
    // V20.4-style defaults instead of poisoning the snapshot.
    const agingSummary = this.aging
      ? await this.aging.getCustomerAging(customerId).catch(() => null)
      : null;
    const riskScore = this.risk
      ? await this.risk.getScore(customerId).catch(() => null)
      : null;
    const collectionsStageRow = await (this.prisma.collectionsAccount
      ? this.prisma.collectionsAccount
          .findUnique({
            where: { customerId },
            select: { currentStage: true },
          })
          .catch(() => null)
      : Promise.resolve(null));

    return {
      customerId,
      journalArBalanceKd,
      remainingDebtKd: canonical.canonicalDebtKd,
      paidTotalKd: invoiceAggregates.paidTotalKd,
      totalInvoicesKd: invoiceAggregates.totalInvoicesKd,
      unpaidInvoicesCount: invoiceAggregates.unpaidInvoicesCount,
      partiallyPaidInvoicesCount: invoiceAggregates.partiallyPaidInvoicesCount,
      activeInvoicesCount: invoiceAggregates.activeInvoicesCount,
      overdueInvoicesCount: invoiceAggregates.overdueInvoicesCount,
      walletBalanceKd: walletRow?.balance
        ? new Prisma.Decimal(walletRow.balance.toString())
        : new Prisma.Decimal(0),
      walletLiabilityKd: walletLiability,
      lastPaymentAt: lastPaymentRow,
      lastInvoiceAt: invoiceAggregates.lastInvoiceAt,
      canonicalSource: canonical.source,
      v20_3TrueAccountingActive: isV20_3TrueAccountingEnabled(),
      // V20.5 — Phase 7 materialised columns.
      agingBucket: agingSummary?.agingBucket ?? 'CURRENT',
      oldestOverdueDays: agingSummary?.oldestOverdueDays ?? 0,
      overdueAmountKd:
        agingSummary &&
        (agingSummary.agingBucket === 'LATE' ||
          agingSummary.agingBucket === 'CRITICAL' ||
          agingSummary.agingBucket === 'LEGAL')
          ? new Prisma.Decimal(agingSummary.totalReceivableKd)
          : new Prisma.Decimal(0),
      riskLevel: riskScore?.level ?? 'LOW',
      riskScore: riskScore?.score ?? 0,
      collectionsStage: collectionsStageRow?.currentStage ?? 'NEW',
    };
  }

  /**
   * Per-customer invoice rollups computed from the SAME scope the
   * canonical helper uses (UNPAID OR DEBT_ON_ACCOUNT, non-canceled).
   * Centralised here so the snapshot, the read-models, and the
   * `DebtVisibilityService` all derive their counts identically.
   */
  private async computeInvoiceAggregates(
    customerId: string,
    _now: Date = new Date(),
    _tx?: Prisma.TransactionClient,
  ): Promise<{
    paidTotalKd: Prisma.Decimal;
    totalInvoicesKd: Prisma.Decimal;
    unpaidInvoicesCount: number;
    partiallyPaidInvoicesCount: number;
    activeInvoicesCount: number;
    overdueInvoicesCount: number;
    lastInvoiceAt: Date | null;
  }> {
    const rows = await this.prisma.order.findMany({
      where: {
        customerId,
        status: { not: OrderStatus.CANCELED },
        OR: [
          { cashStatus: CashStatus.UNPAID },
          { posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT },
        ],
      },
      select: {
        id: true,
        totalPrice: true,
        createdAt: true,
        dueDate: true,
      },
    });
    if (rows.length === 0) {
      return {
        paidTotalKd: new Prisma.Decimal(0),
        totalInvoicesKd: new Prisma.Decimal(0),
        unpaidInvoicesCount: 0,
        partiallyPaidInvoicesCount: 0,
        activeInvoicesCount: 0,
        overdueInvoicesCount: 0,
        lastInvoiceAt: null,
      };
    }
    const remainingByOrder = await computeOrderRemainingBalancesBatch(
      this.prisma,
      rows.map((r) => r.id),
    );
    const now = _now;
    let paidTotalKd = new Prisma.Decimal(0);
    let totalInvoicesKd = new Prisma.Decimal(0);
    let unpaidInvoicesCount = 0;
    let partiallyPaidInvoicesCount = 0;
    let activeInvoicesCount = 0;
    let overdueInvoicesCount = 0;
    let lastInvoiceAt: Date | null = null;
    for (const r of rows) {
      const total = new Prisma.Decimal(r.totalPrice.toString());
      const remaining = remainingByOrder.get(r.id) ?? total;
      const paid = total.sub(remaining);
      totalInvoicesKd = totalInvoicesKd.plus(total);
      paidTotalKd = paidTotalKd.plus(paid);
      const isFullyPaid = remaining.lessThanOrEqualTo(TOL);
      const isPartial = !isFullyPaid && paid.greaterThan(TOL);
      if (!isFullyPaid) {
        activeInvoicesCount += 1;
        if (isPartial) partiallyPaidInvoicesCount += 1;
        else unpaidInvoicesCount += 1;
        if (r.dueDate instanceof Date && r.dueDate.getTime() < now.getTime()) {
          overdueInvoicesCount += 1;
        }
      }
      if (!lastInvoiceAt || r.createdAt > lastInvoiceAt) {
        lastInvoiceAt = r.createdAt;
      }
    }
    return {
      paidTotalKd,
      totalInvoicesKd,
      unpaidInvoicesCount,
      partiallyPaidInvoicesCount,
      activeInvoicesCount,
      overdueInvoicesCount,
      lastInvoiceAt,
    };
  }

  private async findLastRealPaymentAt(
    customerId: string,
  ): Promise<Date | null> {
    // V20.4 — DebtLedger removed; use JournalEntry source='PAYMENT' with orderId
    // (wallet-absorption entries have sourceRef starting with 'PAYMENT:WALLET:'
    // which we exclude — real payments always go through a payment asset account).
    const entry = await this.prisma.journalEntry.findFirst({
      where: {
        customerId,
        source: 'PAYMENT',
        orderId: { not: null },
        NOT: { sourceRef: { startsWith: 'PAYMENT:WALLET:' } },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return entry?.createdAt ?? null;
  }

  private async computeWalletLiability(
    customerId: string,
  ): Promise<Prisma.Decimal> {
    try {
      const snap = await this.journalSource.getCustomerArSnapshot(customerId);
      return snap.walletLiabilityKd;
    } catch {
      return new Prisma.Decimal(0);
    }
  }
}

export type { CanonicalDebtSnapshot };
