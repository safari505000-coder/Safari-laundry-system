import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  AuditStatus,
  CustomerCollectionStatus,
  CustomerCollectionStatusKind,
  Prisma,
  SafariRole,
} from '@prisma/client';
import type { JwtUser } from '../../auth/decorators/current-user.decorator';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { OrdersService } from '../../orders/orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DebtVisibilityService } from '../debt-visibility/debt-visibility.service';
import {
  computeOrderRemainingBalancesBatch,
  INVOICE_REMAINING_TOLERANCE_KD,
} from '../debt-customer-aggregates.util';
import { computeCanonicalOutstandingDriverSummaries } from '../canonical-financial-projection';
import { round4Kd } from '../utils/round4kd.util';
import { getCustomerSubscriptionStateBatch } from '../../subscribers/subscription-state.util';
import { OutstandingQueryDto } from './dto/outstanding-query.dto';
import {
  OutstandingResponseDto,
  OutstandingRowDto,
} from './dto/outstanding-row.dto';
import {
  CustomerCollectionStatusDto,
  UpdateCustomerCollectionStatusDto,
} from './dto/update-customer-collection-status.dto';

/**
 * خدمة المدفوعات المعلقة — مُجمِّع الحسابات المستحقة القبض وإدارة حالة التحصيل
 * Outstanding-Payments / Accounts-Receivable read-side aggregator
 * plus the single mutation surface for collection status and manual blocking.
 *
 * Design rules (DO NOT relax):
 * - Customer blocking is MANUAL ONLY. Nothing auto-flips `blocked`.
 * - Order creation hooks call {@link assertNotBlocked} to fail-closed.
 * - `priorityScore` and `daysLate` are informational; no automation triggers.
 * - Every status mutation produces an audit row plus optional BLOCKED/UNBLOCKED events.
 *
 * @since V19.x
 */
const STATUS_MUTATION_ROLES = new Set<string>([
  'CALL_CENTER',
  'CALL_CENTER_SUPERVISOR',
  'OWNER',
]);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type AggRow = {
  id: string;
  customerId: string;
  driverId: string | null;
  totalPrice: Prisma.Decimal;
  createdAt: Date;
  dueDate: Date | null;
};

/**
 * خدمة المدفوعات المعلقة والحسابات المستحقة القبض
 * Manages outstanding invoice aggregation, collection status mutations,
 * and customer blocking in the AR (accounts-receivable) rail.
 *
 * @since V19.x
 */
@Injectable()
export class OutstandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    @Inject(forwardRef(() => OrdersService))
    private readonly orders: OrdersService,
    private readonly debtVisibility: DebtVisibilityService,
  ) {}

  /**
   * يُرجع قائمة العملاء ذوي المديونيات المعلقة مع مؤشرات الأولوية والتصفية
   * Returns all customers with outstanding receivables, enriched with priority scores,
   * collection statuses, subscription state, and driver summaries.
   *
   * @param query - معايير التصفية والبحث والنطاق الزمني | Filter, search, and date range query
   * @param actor - المستخدم الحالي (لتحديد نطاق الفرع) | Current user for branch scoping
   * @returns قائمة المديونيات المعلقة مع المؤشرات | Outstanding receivables response with KPIs
   * @throws BadRequestException عند تمرير نطاق تاريخ غير صالح | On invalid date range
   * @since V19.x
   */
  async listOutstanding(
    query: OutstandingQueryDto,
    actor?: JwtUser | null,
  ): Promise<OutstandingResponseDto> {
    const bounds = this.resolveReportingBounds(query.from, query.to);

    const queryBranch = query.branchId?.trim() || null;
    const effectiveBranchId =
      actor?.role === SafariRole.DRIVER ? null
      : queryBranch ??
        (actor?.role === SafariRole.MANAGER && actor.branchId ?
          actor.branchId
        : null);

    const hasOrderFilters =
      bounds.dateLimited ||
      Boolean(query.driverId) ||
      Boolean(query.customerId);
    const hasPostFilters =
      Boolean(query.status) ||
      typeof query.blocked === 'boolean' ||
      Boolean((query.search ?? '').trim());
    const noFilters = !hasOrderFilters && !hasPostFilters;

    const collectionsSnapshot = await this.debtVisibility.getCollectionsSnapshot();
    const canonicalTotalDueKd = collectionsSnapshot.totalRemainingDebtKd;
    const canonicalRemainingDueKd = collectionsSnapshot.totalRemainingDebtKd;
    const aggOrders = await this.orders.listCollectionsReceivableAggOrders({
      branchId: effectiveBranchId,
      actor: actor ?? undefined,
      createdAt: bounds.createdAt,
      driverId: query.driverId,
      customerId: query.customerId,
    });

    if (!aggOrders) {
      const response = this.emptyResponse(
        bounds.fromIso,
        bounds.toIso,
        canonicalTotalDueKd,
        canonicalRemainingDueKd,
      );
      this.traceDebtTotals({
        fromOrdersService: canonicalTotalDueKd,
        finalReturned: response.totalDueKd,
      });
      this.assertCanonicalTotal({
        canonicalTotalDueKd,
        finalReturned: response.totalDueKd,
      });
      return response;
    }

    if (aggOrders.length === 0) {
      const response = this.emptyResponse(
        bounds.fromIso,
        bounds.toIso,
        canonicalTotalDueKd,
        canonicalRemainingDueKd,
      );
      this.traceDebtTotals({
        fromOrdersService: canonicalTotalDueKd,
        finalReturned: response.totalDueKd,
      });
      this.assertCanonicalTotal({
        canonicalTotalDueKd,
        finalReturned: response.totalDueKd,
      });
      return response;
    }

    const rows = aggOrders as AggRow[];

    const grouped = this.groupByCustomer(rows);
    const customerIds = Array.from(grouped.keys());
    const driverIds = Array.from(
      new Set(
        rows
          .map((row) => row.driverId)
          .filter((id): id is string => typeof id === 'string'),
      ),
    );

    const [customers, drivers, statuses] = await Promise.all([
      this.prisma.customer.findMany({
        where: { id: { in: customerIds } },
        select: {
          id: true,
          displayName: true,
          phone: true,
          phone2: true,
          isBlocked: true,
        },
      }),
      driverIds.length === 0
        ? Promise.resolve([] as { id: string; fullName: string }[])
        : this.prisma.user.findMany({
            where: { id: { in: driverIds } },
            select: { id: true, fullName: true },
          }),
      this.prisma.customerCollectionStatus.findMany({
        where: { customerId: { in: customerIds } },
      }),
    ]);

    const customerById = new Map(customers.map((c) => [c.id, c]));
    const driverById = new Map(drivers.map((d) => [d.id, d]));
    const statusById = new Map(statuses.map((s) => [s.customerId, s]));

    // V20.3.1 — single batch fetch for per-order remaining balances
    // across every row in the page. Avoids N round-trips and keeps
    // the list endpoint O(1) DB calls regardless of customer count.
    const remainingByOrder = await computeOrderRemainingBalancesBatch(
      this.prisma,
      rows.map((r) => r.id),
    );
    const remainingTol = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);

    // V20.3.2 — single batch fetch for subscription state. NEVER
    // used to filter who appears in Outstanding (a non-subscriber
    // with debt MUST still show up); only attached to each row so
    // the UI can render an independent SUBSCRIBER badge.
    const subscriptionStateByCustomer =
      await getCustomerSubscriptionStateBatch(this.prisma, customerIds);
    const visibleDebtByCustomer =
      await this.debtVisibility.getCustomerVisibleDebtBatch(customerIds);

    const now = Date.now();
    const allRows: OutstandingRowDto[] = [];

    for (const [customerId, orders] of grouped.entries()) {
      const customer = customerById.get(customerId);
      if (!customer) continue;
      const status = statusById.get(customerId);
      const driverId = orders[0]?.driverId ?? null;
      const driver = driverId ? driverById.get(driverId) ?? null : null;

      let totalDueDec = new Prisma.Decimal(0);
      let remainingDueDec = new Prisma.Decimal(0);
      let lastOrderAt: Date | null = null;
      let earliestDue: Date | null = null;
      for (const order of orders) {
        totalDueDec = totalDueDec.plus(order.totalPrice);
        // V20.3.1 — fall back to gross when the helper has no
        // entry for this order (e.g. no payments recorded yet, or
        // the order wasn't reachable via the batch query). Never
        // silently report a smaller number than the canonical
        // remaining; for the no-payments case gross == remaining.
        const rem = remainingByOrder.get(order.id) ?? order.totalPrice;
        if (rem.greaterThan(remainingTol)) {
          remainingDueDec = remainingDueDec.plus(rem);
        }
        if (!lastOrderAt || order.createdAt > lastOrderAt) {
          lastOrderAt = order.createdAt;
        }
        if (
          order.dueDate instanceof Date &&
          (!earliestDue || order.dueDate < earliestDue)
        ) {
          earliestDue = order.dueDate;
        }
      }
      const visibleDebt = visibleDebtByCustomer.get(customerId);
      void visibleDebt;
      const rowRemainingDec = remainingDueDec;
      const totalDueKd = round4Kd(rowRemainingDec);
      const remainingDueKd = round4Kd(rowRemainingDec);
      const remainingDueDecRounded = rowRemainingDec.toDecimalPlaces(
        4,
        Prisma.Decimal.ROUND_HALF_EVEN,
      );
      const paidKd = round4Kd(
        totalDueDec.sub(rowRemainingDec).greaterThan(0)
          ? totalDueDec.sub(rowRemainingDec)
          : new Prisma.Decimal(0),
      );
      const daysLate = earliestDue
        ? Math.max(
            0,
            Math.floor((now - earliestDue.getTime()) / MS_PER_DAY),
          )
        : 0;

      const subState = subscriptionStateByCustomer.get(customerId);
      allRows.push({
        customerId,
        name: customer.displayName ?? null,
        phone: customer.phone,
        phone2: customer.phone2 ?? null,
        driverId,
        driverName: driver?.fullName ?? null,
        totalDueKd,
        remainingDueKd,
        paidKd,
        invoicesCount: orders.length,
        lastOrderAt: lastOrderAt?.toISOString() ?? null,
        earliestDueDate: earliestDue?.toISOString() ?? null,
        daysLate,
        // V20.3.1 — priority based on what is still owed, not what
          // V23.3 — `priorityScore` is a non-canonical operator hint
          // computed via Prisma.Decimal to keep the multiplications
          // free of floating-point drift before the final 4dp round.
          priorityScore: computePriorityScore(remainingDueDecRounded, daysLate),
        status: status?.status ?? CustomerCollectionStatusKind.NORMAL,
        blocked: status?.blocked ?? customer.isBlocked,
        note: status?.note ?? null,
        hasActiveSubscription: subState?.isActiveSubscriber ?? false,
        subscriptionExpiresAt: subState?.subscriptionExpiresAtIso ?? null,
      });
    }

    const filtered = this.applyPostFilters(allRows, query);
    filtered.sort((a, b) => b.priorityScore - a.priorityScore);

    const totals = {
      totalInvoices: 0,
      totalDueDec: new Prisma.Decimal(0),
      remainingDueDec: new Prisma.Decimal(0),
      blockedCount: 0,
      lateCount: 0,
      riskCount: 0,
    };
    for (const row of filtered) {
      totals.totalInvoices += row.invoicesCount;
      totals.totalDueDec = totals.totalDueDec.plus(
        new Prisma.Decimal(row.totalDueKd),
      );
      totals.remainingDueDec = totals.remainingDueDec.plus(
        new Prisma.Decimal(row.remainingDueKd ?? '0'),
      );
      if (row.blocked) totals.blockedCount += 1;
      if (row.status === CustomerCollectionStatusKind.LATE) {
        totals.lateCount += 1;
      }
      if (row.status === CustomerCollectionStatusKind.RISK) {
        totals.riskCount += 1;
      }
    }

    this.traceDebtTotals({
      fromOrdersService: canonicalTotalDueKd,
      finalReturned: totals.totalDueDec.toFixed(4),
    });
    this.assertCanonicalTotal({
      canonicalTotalDueKd,
      finalReturned: totals.totalDueDec.toFixed(4),
    });

    return {
      rows: filtered,
      totalCustomers: filtered.length,
      totalInvoices: totals.totalInvoices,
      driverSummaries: computeCanonicalOutstandingDriverSummaries(filtered),
      totalDueKd: totals.totalDueDec.toFixed(4),
      remainingDueKd: totals.remainingDueDec.toFixed(4),
      source: 'COLLECTIONS_ENGINE',
      blockedCount: totals.blockedCount,
      lateCount: totals.lateCount,
      riskCount: totals.riskCount,
      generatedAt: new Date().toISOString(),
      fromIso: bounds.fromIso,
      toIso: bounds.toIso,
    };
  }

  private traceDebtTotals(input: {
    fromOrdersService: string;
    finalReturned: string;
  }): void {
    void input; // tracing removed — was logging PII and financial data
  }

  private assertCanonicalTotal(input: {
    canonicalTotalDueKd: string;
    finalReturned: string;
  }): void {
    if (input.canonicalTotalDueKd === input.finalReturned) return;

    const diff = Math.abs(
      new Prisma.Decimal(input.finalReturned)
        .sub(input.canonicalTotalDueKd)
        .toNumber(),
    );
    if (diff <= 0.001) return;
  }

  /**
   * يُحدّث حالة التحصيل للعميل ويُسجّل التغيير في سجل التدقيق
   * Updates the collection status (and optional manual block) for a customer.
   * Restricted to CALL_CENTER, CALL_CENTER_SUPERVISOR, and OWNER roles.
   * Emits CUSTOMER_BLOCKED / CUSTOMER_UNBLOCKED financial events on block toggle.
   *
   * @param input.customerId - معرف العميل | Customer ID
   * @param input.body - بيانات التحديث (الحالة، الحظر، الملاحظة) | Update payload
   * @param input.actorUserId - معرف المستخدم الفاعل | Actor user ID
   * @param input.actorRole - دور المستخدم الفاعل | Actor role string
   * @returns حالة التحصيل المحدّثة | Updated collection status DTO
   * @throws ForbiddenException إذا لم يكن للمستخدم صلاحية التحديث | On insufficient role
   * @throws NotFoundException إذا لم يُوجد العميل | If customer not found
   */
  async updateCollectionStatus(input: {
    customerId: string;
    body: UpdateCustomerCollectionStatusDto;
    actorUserId: string | null;
    actorRole: string | null;
  }): Promise<CustomerCollectionStatusDto> {
    const role = (input.actorRole ?? '').trim().toUpperCase();
    if (!STATUS_MUTATION_ROLES.has(role)) {
      throw new ForbiddenException('CUSTOMER_COLLECTION_STATUS_FORBIDDEN');
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: input.customerId },
      select: { id: true, isBlocked: true, blockReason: true, blockedAt: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const before = await this.prisma.customerCollectionStatus.findUnique({
      where: { customerId: input.customerId },
    });

    const blockedNote = (input.body.note ?? '').trim() || null;
    const wantBlocked = Boolean(input.body.blocked);

    const after = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.customerCollectionStatus.upsert({
        where: { customerId: input.customerId },
        create: {
          customerId: input.customerId,
          status: input.body.status,
          blocked: wantBlocked,
          note: blockedNote,
          updatedById: input.actorUserId,
        },
        update: {
          status: input.body.status,
          blocked: wantBlocked,
          note: blockedNote,
          updatedById: input.actorUserId,
        },
      });

      if (wantBlocked && !customer.isBlocked) {
        await tx.customer.update({
          where: { id: input.customerId },
          data: {
            isBlocked: true,
            blockReason: blockedNote ?? 'حظر يدوي - مركز الاتصال',
            blockedAt: new Date(),
          },
        });
      } else if (!wantBlocked && customer.isBlocked) {
        await tx.customer.update({
          where: { id: input.customerId },
          data: { isBlocked: false, blockReason: null, blockedAt: null },
        });
      }

      return updated;
    });

    if (wantBlocked && !customer.isBlocked) {
      this.auditLogs.logFinancialEvent({
        action: 'CUSTOMER_BLOCKED',
        customerId: input.customerId,
        userId: input.actorUserId,
        role: input.actorRole,
        source: 'OUTSTANDING_MANUAL_BLOCK',
        changes: { reason: blockedNote },
      });
    } else if (!wantBlocked && customer.isBlocked) {
      this.auditLogs.logFinancialEvent({
        action: 'CUSTOMER_UNBLOCKED',
        customerId: input.customerId,
        userId: input.actorUserId,
        role: input.actorRole,
        source: 'OUTSTANDING_MANUAL_UNBLOCK',
        changes: { reason: blockedNote },
      });
    }

    this.auditLogs.log({
      userId: input.actorUserId,
      role: input.actorRole,
      action: 'CUSTOMER_COLLECTION_UPDATED',
      resource: 'customer_collection_status',
      customerId: input.customerId,
      status: AuditStatus.SUCCESS,
      changes: {
        before: before
          ? {
              status: before.status,
              blocked: before.blocked,
              note: before.note,
            }
          : null,
        after: {
          status: after.status,
          blocked: after.blocked,
          note: after.note,
        },
      },
    });

    return this.toStatusDto(after);
  }

  /**
   * يُرجع حالة التحصيل الحالية لعميل محدد
   * Returns the current collection status for a customer, falling back to NORMAL/unblocked
   * when no explicit record exists.
   *
   * @param customerId - معرف العميل | Customer ID
   * @returns حالة التحصيل الحالية | Current collection status DTO
   * @throws NotFoundException إذا لم يُوجد العميل | If customer not found
   */
  async getCollectionStatus(
    customerId: string,
  ): Promise<CustomerCollectionStatusDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, isBlocked: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    const row = await this.prisma.customerCollectionStatus.findUnique({
      where: { customerId },
    });
    if (row) return this.toStatusDto(row);
    return {
      customerId,
      status: CustomerCollectionStatusKind.NORMAL,
      blocked: customer.isBlocked,
      note: null,
      updatedAt: new Date(0).toISOString(),
      updatedById: null,
    };
  }

  /**
   * حارس فشل آمن لمسارات إنشاء الطلبات — يرفض الطلبات للعملاء المحظورين
   * Fail-closed guard for order creation paths. Throws a ForbiddenException
   * whenever the customer is manually blocked in the AR rail.
   * NEVER auto-blocks; only enforces the manual flag.
   *
   * @param customerId - معرف العميل | Customer ID
   * @throws ForbiddenException إذا كان العميل محظوراً | If customer is manually blocked
   */
  async assertNotBlocked(customerId: string): Promise<void> {
    const status = await this.prisma.customerCollectionStatus.findUnique({
      where: { customerId },
      select: { blocked: true, note: true },
    });
    if (status?.blocked) {
      throw new ForbiddenException({
        message: 'CUSTOMER_BLOCKED',
        errorCode: 'CUSTOMER_BLOCKED',
        blockReason:
          status.note ?? 'العميل محظور — يرجى مراجعة مركز الاتصال',
      });
    }
  }

  /**
   * Date bounds apply to `Order.createdAt` **only** when the user passes
   * `from` and/or `to`. Otherwise the AR view spans all-time so headline
   * totals stay aligned with the Collections red KPI (no silent 30-day clip).
   */
  private resolveReportingBounds(
    fromIso?: string,
    toIso?: string,
  ): {
    fromIso: string;
    toIso: string;
    createdAt?: { gte: Date; lte: Date };
    dateLimited: boolean;
  } {
    const now = new Date();
    const hasFrom = Boolean(fromIso?.trim());
    const hasTo = Boolean(toIso?.trim());

    if (!hasFrom && !hasTo) {
      const epoch = new Date(0);
      return {
        fromIso: epoch.toISOString(),
        toIso: now.toISOString(),
        dateLimited: false,
      };
    }

    const toDate = hasTo ? new Date(toIso!) : now;
    const fromDate = hasFrom ? new Date(fromIso!) : new Date(0);

    if (Number.isNaN(toDate.getTime()) || Number.isNaN(fromDate.getTime())) {
      throw new BadRequestException('Invalid from/to ISO date');
    }
    if (fromDate.getTime() > toDate.getTime()) {
      throw new BadRequestException('`from` must be before `to`');
    }

    return {
      fromIso: fromDate.toISOString(),
      toIso: toDate.toISOString(),
      createdAt: { gte: fromDate, lte: toDate },
      dateLimited: true,
    };
  }

  private emptyResponse(
    fromIso: string,
    toIso: string,
    totalDueKd = '0.0000',
      remainingDueKd = '0.0000',
  ): OutstandingResponseDto {
    return {
      rows: [],
      totalCustomers: 0,
      totalInvoices: 0,
      totalDueKd,
      remainingDueKd,
      source: 'COLLECTIONS_ENGINE',
      blockedCount: 0,
      lateCount: 0,
      riskCount: 0,
      generatedAt: new Date().toISOString(),
      fromIso,
      toIso,
    };
  }

  private groupByCustomer(rows: AggRow[]): Map<string, AggRow[]> {
    const grouped = new Map<string, AggRow[]>();
    for (const row of rows) {
      const list = grouped.get(row.customerId) ?? [];
      list.push(row);
      grouped.set(row.customerId, list);
    }
    return grouped;
  }

  private applyPostFilters(
    rows: OutstandingRowDto[],
    query: OutstandingQueryDto,
  ): OutstandingRowDto[] {
    const search = (query.search ?? '').trim().toLowerCase();
    return rows.filter((row) => {
      if (query.status && row.status !== query.status) return false;
      if (typeof query.blocked === 'boolean' && row.blocked !== query.blocked) {
        return false;
      }
      if (search) {
        const haystack = [row.name ?? '', row.phone ?? '', row.phone2 ?? '']
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }

  private toStatusDto(
    row: CustomerCollectionStatus,
  ): CustomerCollectionStatusDto {
    return {
      customerId: row.customerId,
      status: row.status,
      blocked: row.blocked,
      note: row.note,
      updatedAt: row.updatedAt.toISOString(),
      updatedById: row.updatedById,
    };
  }
}

  /**
   * V23.3 — Decimal-precise priority-score helper.
   * `priorityScore` is intentionally a non-canonical operator hint
   * (NOT money), so a JS `number` is appropriate. The Decimal pipeline
   * just keeps the multiplications free of floating-point drift before
   * the final 4dp round.
   */
  function computePriorityScore(
    remainingDueDec: Prisma.Decimal,
    daysLate: number,
  ): number {
    return remainingDueDec
      .times(new Prisma.Decimal('0.6'))
      .plus(new Prisma.Decimal(daysLate).times(new Prisma.Decimal('0.4')))
      .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_EVEN)
      .toNumber();
  }
