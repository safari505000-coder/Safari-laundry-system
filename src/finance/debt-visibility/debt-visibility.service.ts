import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
 * through this service. Direct reads of `wallet.debt`,
 * `Order.totalPrice`, `cashStatus`, or `JournalLine.findMany`
 * are forbidden in UI/aggregate paths (see V20.3.2 inspector
 * + scanner).
 *
 * Falls back gracefully:
 *   1. Try the read-side projection (`FinancialSnapshot`).
 *   2. If empty → trigger a synchronous build via
 *      `FinancialSnapshotService.refreshOne(...)`.
 *   3. If the build fails → degrade to the V20.3.2 canonical
 *      helper directly so the UI never sees a hard error.
 */

const TOL = new Prisma.Decimal(UI_DEBT_CONSISTENCY_TOLERANCE_KD);

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
      return this.mapSnapshotToVisibleDebt(snapshot);
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
    for (const id of customerIds) {
      const row = projections.get(id);
      if (row?.canonicalSource === 'JOURNAL_AR') {
        out.set(id, this.mapSnapshotToVisibleDebt(row));
      } else {
        missing.push(id);
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
  async getCollectionsSnapshot(): Promise<CollectionsSnapshot> {
    const candidates = await this.prisma.financialSnapshot.findMany({
      where: {
        OR: [
          { remainingDebtKd: { gt: TOL } },
          { journalArBalanceKd: { gt: TOL } },
        ],
      },
      select: { customerId: true },
    });
    const debts = await this.getCustomerVisibleDebtBatch(
      candidates.map((row) => row.customerId),
    );
    let totalRemaining = new Prisma.Decimal(0);
    let customersWithDebt = 0;
    let partiallyPaidInvoices = 0;
    let unpaidInvoices = 0;
    let overdueInvoices = 0;
    for (const debt of debts.values()) {
      const remaining = new Prisma.Decimal(debt.remainingDebtKd);
      if (remaining.lessThanOrEqualTo(TOL)) continue;
      totalRemaining = totalRemaining.plus(remaining);
      customersWithDebt += 1;
      partiallyPaidInvoices += debt.partiallyPaidInvoicesCount;
      unpaidInvoices += debt.unpaidInvoicesCount;
      overdueInvoices += debt.overdueInvoicesCount;
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
      return this.mapSnapshotToVisibleDebt(refreshed);
    }
    return this.computeVisibleDebtLive(customerId);
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
