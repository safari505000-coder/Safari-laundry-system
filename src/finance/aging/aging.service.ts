import { Injectable, Logger } from '@nestjs/common';
import { CashStatus, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  INVOICE_REMAINING_TOLERANCE_KD,
  computeOrderRemainingBalancesBatch,
} from '../debt-customer-aggregates.util';
import {
  AGING_SEVERITY_RANK,
  RISK_FOR_BUCKET,
  bucketForOverdueDays,
  overdueDaysBetween,
  type AgingBucket,
  type AgingBucketTotal,
  type AgingReport,
  type CustomerAgingSummary,
  type InvoiceAgingRow,
} from './aging.types';

/**
 * V20.5 — Phase 1 Aging Engine.
 *
 * Pure-read service. Reads `Order` (status, totalPrice, createdAt,
 * customerId) + the canonical per-order remaining balance via
 * {@link computeOrderRemainingBalancesBatch}. NEVER writes — every
 * row is computed from primaries on demand, so the engine stays
 * correct under V20.4's append-only journal.
 *
 * Banking-grade buckets (CURRENT / LATE / CRITICAL / LEGAL) are
 * defined in `aging.types.ts`. The cut-offs are the industry
 * standard "30-60-90+" curve; if the operator wants a different
 * window (e.g. 15-day terms), the module exposes the cutoffs as
 * pure constants so a single edit propagates to every consumer.
 *
 * Design notes:
 *   • The "as of" date is parameterised — call sites that surface
 *     a historical snapshot (e.g. month-end report) pass the close
 *     date instead of `new Date()`. Required for Phase 5 period
 *     locking + Phase 4 financial timeline.
 *   • Tolerance reuses the V20.3 remaining tolerance
 *     (INVOICE_REMAINING_TOLERANCE_KD) so a 0.0005 KD float blip
 *     doesn't classify a 30-day-old fully-paid invoice as overdue.
 *   • Risk level is derived from the customer's MAX bucket across
 *     their open invoices — operators care about "worst case", not
 *     average exposure.
 */
@Injectable()
export class AgingService {
  private readonly logger = new Logger(AgingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the per-invoice aging row for ALL open invoices on the
   * book (status != CANCELED, cashStatus = UNPAID, remaining > tol).
   * Used by the report endpoint and by Phase 7 snapshot refresh.
   *
   * Sorted descending by `overdueDays` so the LEGAL rows surface
   * first; downstream pagination is the caller's concern.
   */
  async listInvoiceAging(opts?: {
    asOf?: Date;
    customerId?: string;
  }): Promise<InvoiceAgingRow[]> {
    const asOf = opts?.asOf ?? new Date();
    const orders = await this.prisma.order.findMany({
      where: {
        status: { not: OrderStatus.CANCELED },
        cashStatus: CashStatus.UNPAID,
        ...(opts?.customerId ? { customerId: opts.customerId } : {}),
      },
      select: {
        id: true,
        invoiceNumber: true,
        customerId: true,
        createdAt: true,
        customer: { select: { displayName: true } },
      },
    });
    if (orders.length === 0) return [];

    const remainingById = await computeOrderRemainingBalancesBatch(
      this.prisma,
      orders.map((o) => o.id),
    );
    const tolerance = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);

    const rows: InvoiceAgingRow[] = [];
    for (const o of orders) {
      const remaining = remainingById.get(o.id) ?? new Prisma.Decimal(0);
      if (remaining.lessThanOrEqualTo(tolerance)) continue;
      const overdueDays = overdueDaysBetween(o.createdAt, asOf);
      const bucket = bucketForOverdueDays(overdueDays);
      rows.push({
        invoiceId: o.id,
        invoiceNumber: o.invoiceNumber ?? null,
        customerId: o.customerId,
        customerName: o.customer?.displayName ?? null,
        invoiceDateIso: o.createdAt.toISOString(),
        remainingKd: remaining.toFixed(4),
        overdueDays,
        agingBucket: bucket,
        riskLevel: RISK_FOR_BUCKET[bucket],
      });
    }
    rows.sort((a, b) => b.overdueDays - a.overdueDays);
    return rows;
  }

  /**
   * Roll up `listInvoiceAging` to per-customer summaries. Customer's
   * bucket = MAX(invoiceBucket) so a customer with one 95-day-old
   * invoice and ten 5-day-old invoices is LEGAL, not CURRENT.
   */
  async listCustomerAging(opts?: {
    asOf?: Date;
  }): Promise<CustomerAgingSummary[]> {
    const invoices = await this.listInvoiceAging({ asOf: opts?.asOf });
    const byCustomer = new Map<string, CustomerAgingSummary>();
    for (const inv of invoices) {
      const existing = byCustomer.get(inv.customerId);
      const remaining = new Prisma.Decimal(inv.remainingKd);
      if (!existing) {
        byCustomer.set(inv.customerId, {
          customerId: inv.customerId,
          customerName: inv.customerName,
          totalReceivableKd: remaining.toFixed(4),
          oldestInvoiceDateIso: inv.invoiceDateIso,
          oldestOverdueDays: inv.overdueDays,
          agingBucket: inv.agingBucket,
          riskLevel: inv.riskLevel,
          openInvoiceCount: 1,
        });
        continue;
      }
      const newTotal = new Prisma.Decimal(existing.totalReceivableKd).add(
        remaining,
      );
      const worseBucket =
        AGING_SEVERITY_RANK[inv.agingBucket] >
        AGING_SEVERITY_RANK[existing.agingBucket]
          ? inv.agingBucket
          : existing.agingBucket;
      const olderDays =
        inv.overdueDays > existing.oldestOverdueDays
          ? inv.overdueDays
          : existing.oldestOverdueDays;
      const olderDateIso =
        inv.overdueDays > existing.oldestOverdueDays
          ? inv.invoiceDateIso
          : existing.oldestInvoiceDateIso;
      byCustomer.set(inv.customerId, {
        customerId: inv.customerId,
        customerName: existing.customerName ?? inv.customerName,
        totalReceivableKd: newTotal.toFixed(4),
        oldestInvoiceDateIso: olderDateIso,
        oldestOverdueDays: olderDays,
        agingBucket: worseBucket,
        riskLevel: RISK_FOR_BUCKET[worseBucket],
        openInvoiceCount: existing.openInvoiceCount + 1,
      });
    }
    return Array.from(byCustomer.values()).sort(
      (a, b) => b.oldestOverdueDays - a.oldestOverdueDays,
    );
  }

  /**
   * Aging for a single customer — used by Customer 360 and the
   * subscriber-card decorator. Returns null when the customer has
   * no open AR (the UI hides the badge in that case).
   */
  async getCustomerAging(
    customerId: string,
    asOf: Date = new Date(),
  ): Promise<CustomerAgingSummary | null> {
    const invoices = await this.listInvoiceAging({ asOf, customerId });
    if (invoices.length === 0) return null;
    let total = new Prisma.Decimal(0);
    let worstBucket: AgingBucket = 'CURRENT';
    let oldestDays = 0;
    let oldestDateIso: string | null = null;
    let displayName: string | null = null;
    for (const inv of invoices) {
      total = total.add(new Prisma.Decimal(inv.remainingKd));
      if (
        AGING_SEVERITY_RANK[inv.agingBucket] >
        AGING_SEVERITY_RANK[worstBucket]
      ) {
        worstBucket = inv.agingBucket;
      }
      if (inv.overdueDays > oldestDays) {
        oldestDays = inv.overdueDays;
        oldestDateIso = inv.invoiceDateIso;
      }
      displayName = displayName ?? inv.customerName;
    }
    return {
      customerId,
      customerName: displayName,
      totalReceivableKd: total.toFixed(4),
      oldestInvoiceDateIso: oldestDateIso,
      oldestOverdueDays: oldestDays,
      agingBucket: worstBucket,
      riskLevel: RISK_FOR_BUCKET[worstBucket],
      openInvoiceCount: invoices.length,
    };
  }

  /**
   * Aggregated portfolio report — the GET /api/finance/aging/report
   * endpoint payload. Pure aggregation over `listInvoiceAging`.
   */
  async getReport(opts?: { asOf?: Date }): Promise<AgingReport> {
    const asOf = opts?.asOf ?? new Date();
    const invoices = await this.listInvoiceAging({ asOf });

    const buckets = new Map<
      AgingBucket,
      {
        invoicesCount: number;
        customers: Set<string>;
        total: Prisma.Decimal;
      }
    >();
    const allCustomers = new Set<string>();
    let totalReceivable = new Prisma.Decimal(0);
    let criticalReceivable = new Prisma.Decimal(0);

    for (const inv of invoices) {
      allCustomers.add(inv.customerId);
      const remaining = new Prisma.Decimal(inv.remainingKd);
      totalReceivable = totalReceivable.add(remaining);
      if (
        inv.agingBucket === 'CRITICAL' ||
        inv.agingBucket === 'LEGAL'
      ) {
        criticalReceivable = criticalReceivable.add(remaining);
      }
      const slot = buckets.get(inv.agingBucket) ?? {
        invoicesCount: 0,
        customers: new Set<string>(),
        total: new Prisma.Decimal(0),
      };
      slot.invoicesCount += 1;
      slot.customers.add(inv.customerId);
      slot.total = slot.total.add(remaining);
      buckets.set(inv.agingBucket, slot);
    }

    const orderedBuckets: AgingBucket[] = ['CURRENT', 'LATE', 'CRITICAL', 'LEGAL'];
    const bucketTotals: AgingBucketTotal[] = orderedBuckets.map((b) => {
      const slot = buckets.get(b);
      return {
        bucket: b,
        invoicesCount: slot?.invoicesCount ?? 0,
        customersCount: slot?.customers.size ?? 0,
        totalReceivableKd: (slot?.total ?? new Prisma.Decimal(0)).toFixed(4),
      };
    });

    return {
      generatedAtIso: new Date().toISOString(),
      asOfIso: asOf.toISOString(),
      totalReceivableKd: totalReceivable.toFixed(4),
      criticalReceivableKd: criticalReceivable.toFixed(4),
      customersCount: allCustomers.size,
      invoicesCount: invoices.length,
      bucketTotals,
    };
  }
}
