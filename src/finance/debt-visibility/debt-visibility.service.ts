import { Injectable, Logger } from '@nestjs/common';
import { CashStatus, OrderStatus, PosPaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JournalSourceService } from '../../general-ledger/journal-source.service';
import {
  computeCanonicalCustomerDebt,
  UI_DEBT_CONSISTENCY_TOLERANCE_KD,
} from '../canonical-customer-debt.util';
import {
  computeOrderRemainingBalancesBatch,
  INVOICE_REMAINING_TOLERANCE_KD,
} from '../debt-customer-aggregates.util';
import { FinancialSnapshotService } from '../snapshots/financial-snapshot.service';
import {
  type CollectionsSnapshot,
  type CustomerVisibleDebt,
  type InvoiceVisibility,
  type SubscriberDebtSnapshot,
} from './debt-visibility.types';

/**
 * V20.4 — Phase 3 / Phase 16 canonical visibility façade.
 *
 * Single approved entry point for "what number does the UI
 * show?". Wraps:
 *   • the V20.3.2 canonical helper (fallback when no projection
 *     row exists yet);
 *   • the V20.4 read-side `FinancialSnapshot` projection (hot path);
 *   • the V20.3 Journal AR read (cross-check + per-call source);
 *   • the V20.3.1 partial-payment status helpers.
 *
 * Operational consumers — Subscribers list, Outstanding,
 * Customer 360, dashboards, call-center widgets — MUST go
 * through this service. The displayed debt figure is always
 * overlaid from live Journal AR; snapshots may supply counts
 * and timestamps, but never the final visible money amount.
 *
 * Falls back gracefully:
 *   1. Try the read-side projection (`FinancialSnapshot`).
 *   2. If empty → trigger a synchronous build via
 *      `FinancialSnapshotService.refreshOne(...)`.
 *   3. If the build fails → degrade to the V20.3.2 canonical
 *      helper directly so the UI never sees a hard error.
 */

const TOL = new Prisma.Decimal(UI_DEBT_CONSISTENCY_TOLERANCE_KD);

/**
 * واجهة رؤية الديون الكانونية — المرجع الوحيد لأرقام الديون المعروضة في الواجهة
 * Single approved entry point for "what number does the UI show?".
 * Wraps FinancialSnapshot projection, Journal AR live read, and canonical helper fallback.
 * All operational consumers (Subscribers, Outstanding, Customer 360) MUST go through this.
 *
 * @since V20.4 Phase 3/16
 */
@Injectable()
export class DebtVisibilityService {
  private readonly logger = new Logger(DebtVisibilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: FinancialSnapshotService,
    private readonly journalSource: JournalSourceService,
  ) {}

  /**
   * Single-customer canonical view. The result is what every
   * Customer 360 / subscriber row / outstanding row MUST render.
   */
  /**
   * يُرجع رصيد الدين الكانوني المرئي لعميل واحد
   * Returns the canonical visible debt for a single customer.
   * Tries the snapshot projection first, falls back to live Journal AR, then canonical helper.
   *
   * @param customerId - معرف العميل | Customer ID
   * @returns رصيد الدين الكانوني المرئي | Canonical visible debt for the customer
   */
  async getCustomerVisibleDebt(
    customerId: string,
  ): Promise<CustomerVisibleDebt> {
    try {
      const snapshot = await this.snapshots.getOrBuildForCustomer(
        customerId,
        'CRON_RECONCILE',
      );
      if (snapshot.canonicalSource !== 'JOURNAL_AR') {
        return this.rebuildJournalSnapshotOrLive(customerId);
      }
      return this.overlayLiveJournalDebt(this.mapSnapshotToVisibleDebt(snapshot));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[DEBT_VISIBILITY_FALLBACK] customerId=${customerId} message=${message}`,
      );
      return this.computeVisibleDebtLive(customerId);
    }
  }

  /**
   * Batch path used by Subscribers list / Outstanding to keep
   * page reads O(1) DB calls. Falls back to live computation
   * for any customer the projection doesn't cover yet.
   */
  /**
   * يُرجع أرصدة الديون الكانونية لمجموعة من العملاء في استعلام واحد
   * Batch path for paginated APIs. Falls back to live computation for missing rows.
   * O(1) DB calls for the hot path (snapshot exists).
   *
   * @param customerIds - قائمة معرفات العملاء | List of customer IDs
   * @returns خريطة من معرف العميل إلى الدين المرئي | Map of customerId to visible debt
   */
  async getCustomerVisibleDebtBatch(
    customerIds: string[],
  ): Promise<Map<string, CustomerVisibleDebt>> {
    const out = new Map<string, CustomerVisibleDebt>();
    if (customerIds.length === 0) return out;
    // We deliberately bypass `getOrBuildForCustomer` (sync build)
    // here; a single missing row in a 200-row page should not
    // serialise the whole list behind one rebuild. Projector
    // backfill happens in `rebuildStale` / event hooks instead.
    const projections =
      await this.snapshots.findExistingByCustomerIds(customerIds);
    const missing: string[] = [];
    const snapshotHits: CustomerVisibleDebt[] = [];
    for (const id of customerIds) {
      const row = projections.get(id);
      if (row?.canonicalSource === 'JOURNAL_AR') {
        snapshotHits.push(this.mapSnapshotToVisibleDebt(row));
      } else {
        missing.push(id);
      }
    }
    if (snapshotHits.length > 0) {
      const overlaid = await this.overlayLiveJournalDebtBatch(snapshotHits);
      for (const debt of overlaid) {
        out.set(debt.customerId, debt);
      }
    }
    if (missing.length > 0) {
      // Fan out missing-row computations in parallel; per-customer
      // failure is absorbed and surfaced as a zero-debt row so the
      // page still renders.
      const live = await Promise.all(
        missing.map((id) =>
          this.rebuildJournalSnapshotOrLive(id).catch(() =>
            this.computeVisibleDebtLive(id).catch(() => null),
          ),
        ),
      );
      for (let i = 0; i < missing.length; i += 1) {
        const row = live[i];
        if (row) out.set(missing[i], row);
      }
    }
    return out;
  }

  /**
   * V20.3.1 partial-payment status for a single invoice. Single
   * source of truth for the chip color (UNPAID/PARTIALLY_PAID/PAID).
   */
  /**
   * يُرجع حالة الدفع لفاتورة واحدة (مدفوعة / مدفوعة جزئياً / غير مدفوعة)
   * Returns partial-payment status for a single invoice.
   * Single source of truth for invoice chip colour in the UI.
   *
   * @param orderId - معرف الطلب/الفاتورة | Order/invoice ID
   * @returns رؤية الفاتورة أو null إذا لم تُوجد | Invoice visibility or null
   * @since V20.3.1
   */
  async getInvoiceStatus(orderId: string): Promise<InvoiceVisibility | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, totalPrice: true, status: true },
    });
    if (!order) return null;
    const remainingMap = await computeOrderRemainingBalancesBatch(this.prisma, [
      orderId,
    ]);
    const total = new Prisma.Decimal(order.totalPrice.toString());
    const remaining = remainingMap.get(orderId) ?? total;
    const paid = total.sub(remaining);
    const tol = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);
    const isFullyPaid = remaining.lessThanOrEqualTo(tol);
    const isPartiallyPaid = !isFullyPaid && paid.greaterThan(tol);
    return {
      orderId,
      totalKd: total.toFixed(4),
      paidKd: paid.toFixed(4),
      remainingKd: remaining.toFixed(4),
      paymentStatus: isFullyPaid
        ? 'PAID'
        : isPartiallyPaid
          ? 'PARTIALLY_PAID'
          : 'UNPAID',
      isPartiallyPaid,
      isFullyPaid,
    };
  }

  /**
   * Aggregate snapshot used by collections / red-KPI cards.
   * The final money total is folded through `getCustomerVisibleDebtBatch`
   * so stale projection rows are upgraded to Journal AR before they can
   * feed any KPI.
   */
  /**
   * يُرجع لقطة تجميعية للتحصيل تُستخدم في بطاقات KPI الحمراء
   * Returns an aggregate collections snapshot used by the collections red-KPI cards.
   * The final money total is overlaid through live Journal AR to prevent stale display.
   *
   * @returns لقطة التحصيل الشاملة | Aggregate collections snapshot
   */
  async getCollectionsSnapshot(): Promise<CollectionsSnapshot> {
    const [snapshotCandidates, receivableOrders] = await Promise.all([
      this.prisma.financialSnapshot.findMany({
        where: {
          OR: [
            { remainingDebtKd: { gt: TOL } },
            { journalArBalanceKd: { gt: TOL } },
          ],
        },
        select: { customerId: true },
      }),
      this.prisma.order.findMany({
        where: {
          status: { not: OrderStatus.CANCELED },
          OR: [
            { cashStatus: CashStatus.UNPAID },
            { posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT },
            { posPaymentMethod: PosPaymentMethod.ONLINE },
            { posPaymentMethod: PosPaymentMethod.PAYMENT_LINK },
          ],
        },
        select: {
          id: true,
          customerId: true,
          totalPrice: true,
        },
      }),
    ]);
    const candidateCustomerIds = Array.from(
      new Set([
        ...snapshotCandidates.map((row) => row.customerId),
        ...receivableOrders.map((row) => row.customerId),
      ]),
    );
    const debts = await this.getCustomerVisibleDebtBatch(candidateCustomerIds);
    const remainingByOrder = await computeOrderRemainingBalancesBatch(
      this.prisma,
      receivableOrders.map((row) => row.id),
    );
    const orderRemainingByCustomer = new Map<string, Prisma.Decimal>();
    for (const order of receivableOrders) {
      const rem = remainingByOrder.get(order.id) ?? order.totalPrice;
      if (rem.lessThanOrEqualTo(TOL)) continue;
      const prev = orderRemainingByCustomer.get(order.customerId) ?? new Prisma.Decimal(0);
      orderRemainingByCustomer.set(order.customerId, prev.plus(rem));
    }
    let totalRemaining = new Prisma.Decimal(0);
    let customersWithDebt = 0;
    let partiallyPaidInvoices = 0;
    let unpaidInvoices = 0;
    let overdueInvoices = 0;
    for (const customerId of candidateCustomerIds) {
      const debt = debts.get(customerId);
      const visibleRemaining = new Prisma.Decimal(debt?.remainingDebtKd ?? '0');
      const orderRemaining =
        orderRemainingByCustomer.get(customerId) ?? new Prisma.Decimal(0);
      // V25 — if snapshot/journal overlays lag right after invoice issuance,
      // keep the KPI truthful by falling back to real-time order remaining.
      const remaining = visibleRemaining.greaterThan(orderRemaining)
        ? visibleRemaining
        : orderRemaining;
      if (remaining.lessThanOrEqualTo(TOL)) continue;
      totalRemaining = totalRemaining.plus(remaining);
      customersWithDebt += 1;
      partiallyPaidInvoices += debt?.partiallyPaidInvoicesCount ?? 0;
      unpaidInvoices += debt?.unpaidInvoicesCount ?? 0;
      overdueInvoices += debt?.overdueInvoicesCount ?? 0;
    }
    return {
      totalRemainingDebtKd: totalRemaining.toFixed(4),
      customersWithDebt,
      partiallyPaidInvoices,
      unpaidInvoices,
      overdueInvoices,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Lightweight subscriber-debt projection. Different from
   * {@link getCustomerVisibleDebt} only in that it joins on
   * the active-subscription dimension so the Subscribers list
   * can decide chip visibility without a second query.
   */
  /**
   * يُرجع لقطة ديون المشترك مع حالة الاشتراك النشط
   * Lightweight subscriber-debt projection joining visible debt with active-subscription state.
   * Used by the Subscribers list to decide chip visibility without a second query.
   *
   * @param customerId - معرف العميل | Customer ID
   * @param now - وقت مرجعي (افتراضي: الآن) | Reference time for subscription expiry check
   * @returns لقطة ديون المشترك | Subscriber debt snapshot
   */
  async getSubscriberDebtSnapshot(
    customerId: string,
    now: Date = new Date(),
  ): Promise<SubscriberDebtSnapshot> {
    const [debt, sub] = await Promise.all([
      this.getCustomerVisibleDebt(customerId),
      this.prisma.customerSubscription.findFirst({
        where: {
          customerId,
          status: 'ACTIVE',
          expiresAt: { gt: now },
        },
        select: { id: true, expiresAt: true },
      }),
    ]);
    return {
      customerId,
      remainingDebtKd: debt.remainingDebtKd,
      hasDebt: debt.hasDebt,
      hasActiveSubscription: sub != null,
    };
  }

  // ── Internals ─────────────────────────────────────────────────

  private mapSnapshotToVisibleDebt(snapshot: {
    customerId: string;
    journalArBalanceKd: Prisma.Decimal;
    remainingDebtKd: Prisma.Decimal;
    paidTotalKd: Prisma.Decimal;
    totalInvoicesKd: Prisma.Decimal;
    walletBalanceKd: Prisma.Decimal;
    walletLiabilityKd: Prisma.Decimal;
    unpaidInvoicesCount: number;
    partiallyPaidInvoicesCount: number;
    activeInvoicesCount: number;
    overdueInvoicesCount: number;
    lastPaymentAt: Date | null;
    lastInvoiceAt: Date | null;
    canonicalSource: CustomerVisibleDebt['canonicalSource'];
    refreshedAt: Date;
  }): CustomerVisibleDebt {
    const journalAr = new Prisma.Decimal(snapshot.journalArBalanceKd.toString());
    const projectedRemaining = new Prisma.Decimal(
      snapshot.remainingDebtKd.toString(),
    );
    const remaining =
      snapshot.canonicalSource === 'JOURNAL_AR'
        ? journalAr
        : projectedRemaining;
    return {
      customerId: snapshot.customerId,
      remainingDebtKd: remaining.toFixed(4),
      paidTotalKd: snapshot.paidTotalKd.toFixed(4),
      totalInvoicesKd: snapshot.totalInvoicesKd.toFixed(4),
      journalArBalanceKd: journalAr.toFixed(4),
      walletLiabilityKd: snapshot.walletLiabilityKd.toFixed(4),
      walletBalanceKd: snapshot.walletBalanceKd.toFixed(4),
      unpaidInvoicesCount: snapshot.unpaidInvoicesCount,
      partiallyPaidInvoicesCount: snapshot.partiallyPaidInvoicesCount,
      activeInvoicesCount: snapshot.activeInvoicesCount,
      overdueInvoicesCount: snapshot.overdueInvoicesCount,
      hasDebt: remaining.greaterThan(TOL),
      lastPaymentAt: snapshot.lastPaymentAt?.toISOString() ?? null,
      lastInvoiceAt: snapshot.lastInvoiceAt?.toISOString() ?? null,
      canonicalSource: snapshot.canonicalSource,
      fromSnapshot: true,
      snapshotRefreshedAt: snapshot.refreshedAt.toISOString(),
    };
  }

  private async rebuildJournalSnapshotOrLive(
    customerId: string,
  ): Promise<CustomerVisibleDebt> {
    const refreshed = await this.snapshots.refreshOne(
      customerId,
      'CRON_RECONCILE',
    );
    if (refreshed.canonicalSource === 'JOURNAL_AR') {
      return this.overlayLiveJournalDebt(this.mapSnapshotToVisibleDebt(refreshed));
    }
    return this.computeVisibleDebtLive(customerId);
  }

  private async overlayLiveJournalDebt(
    debt: CustomerVisibleDebt,
  ): Promise<CustomerVisibleDebt> {
    try {
      const journalAr = await this.journalSource.getCustomerDebtFromJournalAR(
        debt.customerId,
      );
      const remainingDebtKd = journalAr.toFixed(4);
      return {
        ...debt,
        remainingDebtKd,
        journalArBalanceKd: remainingDebtKd,
        hasDebt: journalAr.greaterThan(TOL),
        canonicalSource: 'JOURNAL_AR',
      };
    } catch {
      return {
        ...debt,
        canonicalSource: 'SNAPSHOT_FALLBACK',
      };
    }
  }

  private async overlayLiveJournalDebtBatch(
    debts: CustomerVisibleDebt[],
  ): Promise<CustomerVisibleDebt[]> {
    if (debts.length === 0) return [];
    try {
      const balances = await this.journalSource.getCustomerDebtFromJournalARBatch(
        debts.map((debt) => debt.customerId),
      );
      return debts.map((debt) => {
        const journalAr = balances.get(debt.customerId) ?? new Prisma.Decimal(0);
        const remainingDebtKd = journalAr.toFixed(4);
        return {
          ...debt,
          remainingDebtKd,
          journalArBalanceKd: remainingDebtKd,
          hasDebt: journalAr.greaterThan(TOL),
          canonicalSource: 'JOURNAL_AR',
        };
      });
    } catch {
      return debts.map((debt) => ({
        ...debt,
        canonicalSource: 'SNAPSHOT_FALLBACK',
      }));
    }
  }

  /**
   * Final fallback when no projection exists AND a sync build
   * failed. Uses the V20.3.2 canonical helper directly so the
   * UI still gets a number — albeit with `fromSnapshot=false`
   * so operators can spot a degraded read.
   */
  private async computeVisibleDebtLive(
    customerId: string,
  ): Promise<CustomerVisibleDebt> {
    const canonical = await computeCanonicalCustomerDebt(
      this.prisma,
      this.journalSource,
      customerId,
    );
    const remaining = canonical.canonicalDebtKd;
    const journalAr = canonical.journalArKd ?? new Prisma.Decimal(0);
    return {
      customerId,
      remainingDebtKd: remaining.toFixed(4),
      paidTotalKd: '0.0000',
      totalInvoicesKd: '0.0000',
      journalArBalanceKd: journalAr.toFixed(4),
      walletLiabilityKd: '0.0000',
      walletBalanceKd: '0.0000',
      unpaidInvoicesCount: 0,
      partiallyPaidInvoicesCount: 0,
      activeInvoicesCount: 0,
      overdueInvoicesCount: 0,
      hasDebt: remaining.greaterThan(TOL),
      lastPaymentAt: null,
      lastInvoiceAt: null,
      canonicalSource: canonical.source,
      fromSnapshot: false,
      snapshotRefreshedAt: null,
    };
  }
}
