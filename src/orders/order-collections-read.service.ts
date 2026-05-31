import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CashStatus,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
  SafariRole,
} from '@prisma/client';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { computeCanonicalUnpaidOnlineReportProjection } from '../finance/canonical-financial-projection';
import {
  computeOrderRemainingBalancesBatch,
  getCustomerDebtSnapshotTotalKd,
  getCustomerNetDebtFromDebtLedgerAgg,
  INVOICE_REMAINING_TOLERANCE_KD,
} from '../finance/debt-customer-aggregates.util';
import { DebtVisibilityService } from '../finance/debt-visibility/debt-visibility.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildDebtKdBreakdownTrace,
  type DebtKdBreakdownTrace,
} from './debt-kd-breakdown.util';
import { collectionDebtReasonAr } from './order-notification-format.util';
import { resolveOperationalDebtKd } from './order-operational-debt.util';
import { type PrismaOrderDb } from './order-types';

/**
 * Phase 3 extraction — read-only Collections / market-debt projections.
 *
 * Holds every read path that maps open invoices to the canonical visible-debt
 * cap (DebtVisibility) and the FIFO open-debt scope. Pure reads only:
 * NO journal writes, NO order mutations, NO transactions started here (callers
 * pass their own `tx`). `OrdersService` keeps the public method signatures and
 * delegates to this service (facade), so external consumers are unchanged.
 */
@Injectable()
export class OrderCollectionsReadService {
  private readonly log = new Logger(OrderCollectionsReadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly debtVisibility: DebtVisibilityService,
  ) {}

  /**
   * V1.5.6 — "Debt-Tracking Page" as a Financial Oversight Report.
   * V1.6.5 — adds optional `branchId` scoping, a human-readable
   * `readableId`, and 3-decimal KWD formatting (fils).
   *
   * Returns EVERY uncollected invoice regardless of payment method (Cash,
   * KNET, Payment Link, Online, Wallet, Debt-on-account). Filters:
   *
   *   cashStatus = UNPAID  AND  status != CANCELED
   *   AND (branch scope — see `orderBranchWhere` below)
   *
   * The sum of `amountKd` across the returned rows is the
   * "Market Debt Total" surfaced on the Collections KPI card — both
   * values are driven by the SAME predicate so they always match byte
   * for byte, including under a branch filter.
   *
   * `readableId` order of preference:
   *   1. `serialNumber`  — human-readable driver serial ("D2-1045")
   *   2. `invoiceNumber` — paper invoice reference
   *   3. last 6 chars of UUID, upper-cased — always present
   */
  async listUnpaidCollectionOrders(
    branchId: string | null = null,
    actor?: JwtUser,
    /** When set, returns every open collectible row for one customer (no global take cap). */
    customerId?: string,
  ): Promise<
    {
      orderId: string;
      customerId: string;
      readableId: string;
      invoiceNumber: string | null;
      customerName: string;
      customerPhone: string;
      amountKd: string;
      paymentMethod: PosPaymentMethod | null;
      paymentUrl: string | null;
      createdAtIso: string;
      invoiceAgeDays: number;
      reminderCount: number;
      lastReminderAtIso: string | null;
      canRemindNow: boolean;
      /** True when field (driver/manager) already sent payment link — CC agents must not duplicate WhatsApp. */
      ccCollectionPaymentWaLocked: boolean;
      /** For CC: false when `ccCollectionPaymentWaLocked`; other roles ignore the lock. */
      canSendCollectionPaymentWa: boolean;
      // V19.4 — CC pack #5. Contextual identity for the WhatsApp
      // template + CC dashboard: which branch the sale came from and
      // which driver handled the delivery. Nullable because legacy
      // office bookings may lack a driver, and customers created
      // before origin-branch tracking may lack a branch.
      branchName: string | null;
      driverName: string | null;
      // V1.6.6 — raw line items for the WhatsApp template. Quantities
      // and unit prices are decimal strings (the Prisma convention on
      // this project); the frontend formats them for display.
      lineItems: {
        label: string | null;
        quantity: string;
        unitPriceKd: string;
        lineTotalKd: string;
      }[];
      /** Live hosted link for the customer's full visible AR (not just this row). */
      fullBalanceLinkKd: string | null;
      fullBalancePaymentUrl: string | null;
      fullBalanceLinkSentAtIso: string | null;
    }[]
  > {
    // Mirrors the helper in `call-center.service.ts` so the two islands
    // stay independent yet produce identical scoping. For driver-led
    // sales we match `driver.branchId`; for driver-less invoices (office
    // bookings, online prepaid, etc.) we fall back to the customer's
    // `originBranchId`. Omitting `branchId` yields the global view.
    const isDriver = actor?.role === SafariRole.DRIVER;
    const effectiveBranchId =
      isDriver ? null
      : branchId ??
        (actor?.role === SafariRole.MANAGER && actor.branchId ?
          actor.branchId
        : null);

    const branchWhere: Prisma.OrderWhereInput | undefined = isDriver
      ? { driverId: actor!.userId }
      : effectiveBranchId
        ? {
            OR: [
              { driver: { is: { branchId: effectiveBranchId } } },
              {
                driverId: null,
                customer: { is: { originBranchId: effectiveBranchId } },
              },
            ],
          }
        : undefined;

    // V1.7.4 — Owner directive: DEBT_ON_ACCOUNT invoices must also feed
    // the Collections panel (previously the query filtered by
    // `cashStatus: UNPAID` only, which excluded debt-on-account sales
    // because their mapping pins cashStatus to PAID_TO_DRIVER even
    // though the customer still owes the money). We reuse the same
    // pattern the driver Field-Tracker already uses: widen with OR +
    // FIFO-filter via `resolveOpenDebtOrderIds`, so an invoice drops
    // off the list the moment the customer settles through any channel
    // (office cash by accountant, CC manual mark, partial debt payment,
    // gateway link, etc.).
    const collectiblesOr: Prisma.OrderWhereInput['OR'] = [
      { cashStatus: CashStatus.UNPAID },
      { posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT },
      { posPaymentMethod: PosPaymentMethod.ONLINE },
      { posPaymentMethod: PosPaymentMethod.PAYMENT_LINK },
      {
        posPaymentMethod: PosPaymentMethod.SUBSCRIPTION_WALLET,
        customer: {
          is: {
            wallet: {
              is: { debt: { gt: new Prisma.Decimal(0) } },
            },
          },
        },
      },
    ];
    const orderSelect = {
      id: true,
      customerId: true,
      serialNumber: true,
      invoiceNumber: true,
      totalPrice: true,
      posPaymentMethod: true,
      posHostedPaymentUrl: true,
      status: true,
      cashStatus: true,
      createdAt: true,
      reminderCount: true,
      lastReminderAt: true,
      ccCollectionPaymentWaLocked: true,
      customer: {
        select: {
          id: true,
          displayName: true,
          phone: true,
          phone2: true,
          originBranch: { select: { name: true } },
        },
      },
      driver: {
        select: {
          fullName: true,
          branch: { select: { name: true } },
        },
      },
      lineItems: {
        select: {
          label: true,
          quantity: true,
          unitPrice: true,
        },
        orderBy: { createdAt: 'asc' as const },
      },
    };
    let rows = await this.prisma.order.findMany({
      where: {
        status: { not: OrderStatus.CANCELED },
        ...(customerId ? { customerId } : {}),
        OR: collectiblesOr,
        ...(branchWhere ?? {}),
      },
      select: orderSelect,
      orderBy: { createdAt: 'desc' },
      ...(customerId ? {} : { take: 200 }),
    });

    type CollectionOrderRow = (typeof rows)[number];

    const mergeCustomerOpenCollectibleRows = async (
      customerIds: string[],
      knownIds: Set<string>,
    ): Promise<CollectionOrderRow[]> => {
      if (customerIds.length === 0) return [];
      const extra = await this.prisma.order.findMany({
        where: {
          customerId: { in: customerIds },
          id: { notIn: [...knownIds] },
          status: { not: OrderStatus.CANCELED },
        },
        select: orderSelect,
        orderBy: { createdAt: 'desc' },
      });
      if (extra.length === 0) return [];
      const remainingMap = await computeOrderRemainingBalancesBatch(
        this.prisma,
        extra.map((r) => r.id),
      );
      const tolerance = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);
      return extra.filter((r) => {
        const remaining = remainingMap.get(r.id) ?? r.totalPrice;
        if (remaining.greaterThan(tolerance)) return true;
        return (
          r.status === OrderStatus.PENDING &&
          r.cashStatus === CashStatus.UNPAID &&
          r.totalPrice.greaterThan(tolerance)
        );
      });
    };

    // Customer-scoped reads must mirror the public portal: every journal-open
    // order line, not only rows matching the global collectibles OR predicate.
    if (customerId) {
      const merged = await mergeCustomerOpenCollectibleRows(
        [customerId],
        new Set(rows.map((r) => r.id)),
      );
      if (merged.length > 0) {
        rows = [...rows, ...merged];
      }
    }

    // V20.8.1 — every row, including cashStatus=UNPAID, is filtered by
    // canonical remaining balance. Subscription activation and partial
    // payments may reduce an invoice without flipping cashStatus immediately,
    // so gross status alone is not enough for Collections visibility.
    const debtCandidates = rows.filter(
      (r) => r.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT,
    );
    let openDebtOrderIds = await this.resolveOpenDebtOrderIds(
      debtCandidates.map((r) => ({ orderId: r.id, customerId: r.customerId })),
    );
    let remainingByOrder = await computeOrderRemainingBalancesBatch(
      this.prisma,
      rows.map((r) => r.id),
    );
    const tol = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);
    const buildCollectibleRemaining = (
      remainingMap: Map<string, Prisma.Decimal>,
    ) => {
      return (r: (typeof rows)[number]) => {
        const remaining = remainingMap.get(r.id) ?? r.totalPrice;
        if (
          remaining.lessThanOrEqualTo(tol) &&
          r.status === OrderStatus.PENDING &&
          r.cashStatus === CashStatus.UNPAID
        ) {
          return r.totalPrice;
        }
        return remaining;
      };
    };
    let collectibleRemaining = buildCollectibleRemaining(remainingByOrder);
    let filteredRows = rows.filter((r) => {
      const remaining = collectibleRemaining(r);
      if (remaining.lessThanOrEqualTo(tol)) return false;
      // Journal-open lines for a customer-scoped read (portal parity).
      if (customerId) return true;
      if (r.cashStatus === CashStatus.UNPAID) return true;
      if (
        r.posPaymentMethod === PosPaymentMethod.ONLINE ||
        r.posPaymentMethod === PosPaymentMethod.PAYMENT_LINK
      ) {
        return true;
      }
      if (r.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT) {
        return openDebtOrderIds.has(r.id);
      }
      if (r.posPaymentMethod === PosPaymentMethod.SUBSCRIPTION_WALLET) {
        return remaining.greaterThan(tol);
      }
      return false;
    });

    // Rows already fetched (e.g. DEBT_ON_ACCOUNT) can fail the legacy
    // payment-method gates while still carrying journal-open balance.
    // Pull them back before gap-fetch so 4.250 + 10.250 both surface.
    if (!customerId && rows.length > 0) {
      const visibleEarly =
        await this.debtVisibility.getCustomerVisibleDebtBatch(
          Array.from(new Set(rows.map((r) => r.customerId))),
        );
      for (const cid of new Set(rows.map((r) => r.customerId))) {
        const visibleDebt = new Prisma.Decimal(
          visibleEarly.get(cid)?.remainingDebtKd ?? '0',
        );
        let rowSum = filteredRows
          .filter((r) => r.customerId === cid)
          .reduce(
            (sum, r) => sum.plus(collectibleRemaining(r)),
            new Prisma.Decimal(0),
          );
        if (visibleDebt.minus(rowSum).lessThanOrEqualTo(tol)) continue;
        for (const r of rows) {
          if (r.customerId !== cid) continue;
          if (filteredRows.some((f) => f.id === r.id)) continue;
          if (collectibleRemaining(r).greaterThan(tol)) {
            filteredRows.push(r);
            rowSum = rowSum.plus(collectibleRemaining(r));
          }
        }
      }
    }

    // Global queue uses take:200; older open lines for the same customer can
    // fall outside that window while the KPI still shows full visible AR.
    if (!customerId && filteredRows.length > 0) {
      const visibleEarly =
        await this.debtVisibility.getCustomerVisibleDebtBatch(
          Array.from(new Set(filteredRows.map((r) => r.customerId))),
        );
      const gapCustomerIds: string[] = [];
      for (const cid of new Set(filteredRows.map((r) => r.customerId))) {
        const visibleDebt = new Prisma.Decimal(
          visibleEarly.get(cid)?.remainingDebtKd ?? '0',
        );
        const rowSum = filteredRows
          .filter((r) => r.customerId === cid)
          .reduce(
            (sum, r) => sum.plus(collectibleRemaining(r)),
            new Prisma.Decimal(0),
          );
        if (visibleDebt.minus(rowSum).greaterThan(tol)) {
          gapCustomerIds.push(cid);
        }
      }
      if (gapCustomerIds.length > 0) {
        const knownIds = new Set(rows.map((r) => r.id));
        const extraRows = await mergeCustomerOpenCollectibleRows(
          gapCustomerIds,
          knownIds,
        );
        if (extraRows.length > 0) {
          rows = [...rows, ...extraRows];
          const mergedDebtCandidates = rows.filter(
            (r) => r.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT,
          );
          openDebtOrderIds = await this.resolveOpenDebtOrderIds(
            mergedDebtCandidates.map((r) => ({
              orderId: r.id,
              customerId: r.customerId,
            })),
          );
          remainingByOrder = await computeOrderRemainingBalancesBatch(
            this.prisma,
            rows.map((r) => r.id),
          );
          collectibleRemaining = buildCollectibleRemaining(remainingByOrder);
          filteredRows = rows.filter((r) => {
            const remaining = collectibleRemaining(r);
            if (remaining.lessThanOrEqualTo(tol)) return false;
            if (r.cashStatus === CashStatus.UNPAID) return true;
            if (
              r.posPaymentMethod === PosPaymentMethod.ONLINE ||
              r.posPaymentMethod === PosPaymentMethod.PAYMENT_LINK
            ) {
              return true;
            }
            if (r.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT) {
              return openDebtOrderIds.has(r.id);
            }
            if (r.posPaymentMethod === PosPaymentMethod.SUBSCRIPTION_WALLET) {
              return remaining.greaterThan(tol);
            }
            // Gap merge: journal-open lines for customers with AR drift.
            if (gapCustomerIds.includes(r.customerId)) return true;
            return false;
          });
        }
      }
    }
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    // V1.6.8 — Collections recall window (must stay in sync with
    // `ORDER_REMINDER_COOLDOWN_MS` in call-center.service.ts). Drives
    // the `canRemindNow` flag that greys out the Send-payment-link
    // button on the table until 2.5 h after the last reminder.
    const ORDER_REMINDER_COOLDOWN_MS = 2.5 * 60 * 60 * 1000;
    const visibleDebtByCustomer =
      await this.debtVisibility.getCustomerVisibleDebtBatch(
        Array.from(new Set(filteredRows.map((r) => r.customerId))),
      );
    const visibleBudgetByCustomer = new Map<string, Prisma.Decimal>();
    for (const cid of new Set(filteredRows.map((r) => r.customerId))) {
      const visibleDebt = new Prisma.Decimal(
        visibleDebtByCustomer.get(cid)?.remainingDebtKd ?? '0',
      );
      // Cap row display to banking-core customer AR so the table sum matches
      // the red KPI card (DebtVisibility), even when per-order journal slices
      // temporarily drift above the aggregate.
      visibleBudgetByCustomer.set(cid, visibleDebt);
    }
    const allocationOrder = [...filteredRows].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const projectedRows = allocationOrder.flatMap((r) => {
      const rawRemaining = collectibleRemaining(r);
      const customerBudget =
        visibleBudgetByCustomer.get(r.customerId) ?? new Prisma.Decimal(0);
      if (customerBudget.lessThanOrEqualTo(tol)) return [];
      const displayRemaining =
        rawRemaining.lessThanOrEqualTo(customerBudget)
          ? rawRemaining
          : customerBudget;
      visibleBudgetByCustomer.set(
        r.customerId,
        customerBudget.minus(displayRemaining),
      );
      const phone =
        r.customer.phone?.replace(/[\s-]/g, '').trim() ||
        r.customer.phone2?.replace(/[\s-]/g, '').trim() ||
        '';
      const name =
        r.customer.displayName?.trim() ||
        (phone ? phone : 'Customer');
      const ageMs = Math.max(0, now - r.createdAt.getTime());
      const invoiceAgeDays = Math.floor(ageMs / DAY_MS);
      const lastReminderMs = r.lastReminderAt?.getTime() ?? null;
      const canRemindNow =
        lastReminderMs === null ||
        now - lastReminderMs >= ORDER_REMINDER_COOLDOWN_MS;
      const canSendCollectionPaymentWa = canRemindNow;
      const readableId =
        r.serialNumber?.trim() ||
        r.invoiceNumber?.trim() ||
        `#${r.id.slice(-6).toUpperCase()}`;
      // V1.6.6 — line items serialized in 3dp KWD to match the rest of
      // the Collections island. `lineTotal = quantity * unitPrice` is
      // computed server-side so the frontend just pipes strings into
      // the WhatsApp template.
      const lineItems = r.lineItems.map((li) => {
        const lineTotal = li.quantity.mul(li.unitPrice);
        return {
          label: li.label,
          quantity: li.quantity.toString(),
          unitPriceKd: li.unitPrice.toFixed(3),
          lineTotalKd: lineTotal.toFixed(3),
        };
      });
      // V19.4 — CC pack #5. Driver's branch is authoritative; fall
      // back to the customer's origin branch for driver-less (office
      // booking / online prepaid) orders.
      const branchName =
        r.driver?.branch?.name?.trim() ||
        r.customer.originBranch?.name?.trim() ||
        null;
      const driverName = r.driver?.fullName?.trim() || null;
      return {
        orderId: r.id,
        customerId: r.customerId,
        readableId,
        invoiceNumber: r.invoiceNumber ?? null,
        customerName: name,
        customerPhone: phone,
        // Displayed collections money is capped by the live banking-core
        // customer AR balance. Per-order remaining only allocates that
        // canonical balance across visible invoice rows.
        amountKd: displayRemaining.toFixed(3),
        paymentMethod: r.posPaymentMethod,
        paymentUrl: r.posHostedPaymentUrl ?? null,
        createdAtIso: r.createdAt.toISOString(),
        invoiceAgeDays,
        reminderCount: r.reminderCount,
        lastReminderAtIso: r.lastReminderAt
          ? r.lastReminderAt.toISOString()
          : null,
        canRemindNow,
        ccCollectionPaymentWaLocked: r.ccCollectionPaymentWaLocked,
        canSendCollectionPaymentWa,
        branchName,
        driverName,
        lineItems,
      };
    });
    return this.enrichCollectionRowsWithFullBalanceLinkInfo(projectedRows);
  }

  /**
   * Surfaces customer-level full-balance payment links on every queue row so
   * CC agents see when a 14.500 link is live vs a per-invoice 10.250 link.
   */
  private async enrichCollectionRowsWithFullBalanceLinkInfo<
    T extends { customerId: string },
  >(
    rows: T[],
  ): Promise<
    (T & {
      fullBalanceLinkKd: string | null;
      fullBalancePaymentUrl: string | null;
      fullBalanceLinkSentAtIso: string | null;
    })[]
  > {
    if (rows.length === 0) {
      return [];
    }
    const customerIds = Array.from(new Set(rows.map((r) => r.customerId)));
    const visibleByCustomer =
      await this.debtVisibility.getCustomerVisibleDebtBatch(customerIds);
    const tol = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);
    const linkOrders = await this.prisma.order.findMany({
      where: {
        customerId: { in: customerIds },
        posHostedPaymentUrl: { not: null },
        posGatewayTrackId: { not: null },
      },
      select: {
        customerId: true,
        posHostedPaymentUrl: true,
        posGatewayMetadata: true,
      },
    });

    const fullBalanceByCustomer = new Map<
      string,
      { amountKd: string; url: string; sentAtIso: string | null }
    >();

    for (const cid of customerIds) {
      const visibleDebt = new Prisma.Decimal(
        visibleByCustomer.get(cid)?.remainingDebtKd ?? '0',
      );
      if (visibleDebt.lessThanOrEqualTo(tol)) continue;

      for (const order of linkOrders.filter((o) => o.customerId === cid)) {
        const meta =
          order.posGatewayMetadata &&
          typeof order.posGatewayMetadata === 'object' &&
          !Array.isArray(order.posGatewayMetadata)
            ? (order.posGatewayMetadata as Record<string, unknown>)
            : null;
        if (!meta || !order.posHostedPaymentUrl) continue;

        const fullBalance = meta.fullBalance;
        if (
          fullBalance &&
          typeof fullBalance === 'object' &&
          !Array.isArray(fullBalance)
        ) {
          const fb = fullBalance as Record<string, unknown>;
          const amountRaw = fb.amountKd;
          if (typeof amountRaw === 'string' && amountRaw.trim()) {
            fullBalanceByCustomer.set(cid, {
              amountKd: new Prisma.Decimal(amountRaw).toFixed(3),
              url: order.posHostedPaymentUrl,
              sentAtIso:
                typeof fb.sentAt === 'string' ? fb.sentAt : null,
            });
            break;
          }
        }

        const storedCharge = this.readCollectionPaymentLinkChargeKd(meta);
        if (
          storedCharge &&
          storedCharge.sub(visibleDebt).abs().lessThanOrEqualTo(tol)
        ) {
          const charge = meta.charge;
          const sentAtIso =
            charge &&
            typeof charge === 'object' &&
            !Array.isArray(charge) &&
            typeof (charge as Record<string, unknown>).createdAt === 'string'
              ? ((charge as Record<string, unknown>).createdAt as string)
              : null;
          fullBalanceByCustomer.set(cid, {
            amountKd: storedCharge.toFixed(3),
            url: order.posHostedPaymentUrl,
            sentAtIso,
          });
          break;
        }
      }
    }

    return rows.map((row) => {
      const fb = fullBalanceByCustomer.get(row.customerId);
      return {
        ...row,
        fullBalanceLinkKd: fb?.amountKd ?? null,
        fullBalancePaymentUrl: fb?.url ?? null,
        fullBalanceLinkSentAtIso: fb?.sentAtIso ?? null,
      };
    });
  }

  private readCollectionPaymentLinkChargeKd(
    metadata: Record<string, unknown>,
  ): Prisma.Decimal | null {
    const charge = metadata.charge;
    if (!charge || typeof charge !== 'object' || Array.isArray(charge)) {
      return null;
    }
    const raw = (charge as Record<string, unknown>).amountKd;
    try {
      if (typeof raw === 'string' && raw.trim()) {
        return new Prisma.Decimal(raw);
      }
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        return new Prisma.Decimal(raw);
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * يبني تقرير الديون السوقية من صفوف التحصيل المفتوحة مع ملخص روابط الدفع والفروع دون تعديل أي دين.
   * Builds the market-debt report from open collection rows with payment-link and branch summaries without mutating debt.
   * @param branchId - معرف الفرع الاختياري لتقييد التقرير / Optional branch id for report scoping
   * @param actor - المستخدم الحالي لتطبيق نطاق الدور / Current actor used for role-based scoping
   * @returns صفوف التقرير وملخصات الفروع وروابط الدفع / Report rows plus branch and payment-link summaries
   */
  async listUnpaidCollectionOrdersReport(
    branchId: string | null = null,
    actor?: JwtUser,
  ): Promise<{
    rows: Awaited<ReturnType<OrderCollectionsReadService['listUnpaidCollectionOrders']>>;
    paymentLinkRows: Awaited<ReturnType<OrderCollectionsReadService['listUnpaidCollectionOrders']>>;
    branchSummaries: ReturnType<
      typeof computeCanonicalUnpaidOnlineReportProjection
    >['branchSummaries'];
    paymentLinkSummary: ReturnType<
      typeof computeCanonicalUnpaidOnlineReportProjection
    >['paymentLinkSummary'];
  }> {
    const rows = await this.listUnpaidCollectionOrders(branchId, actor);
    const projection = computeCanonicalUnpaidOnlineReportProjection(rows);
    return {
      rows,
      paymentLinkRows: projection.paymentLinkRowIndexes
        .slice(0, 50)
        .map((index) => rows[index])
        .filter((row): row is (typeof rows)[number] => Boolean(row)),
      branchSummaries: projection.branchSummaries,
      paymentLinkSummary: projection.paymentLinkSummary,
    };
  }

  /**
   * V1.7.4 — Market-debt aggregate that mirrors the widened Collections
   * list (`listUnpaidCollectionOrders`). Returns the single Decimal sum
   * the Red KPI card displays, so the table footer and the card always
   * match to the last fils. Kept as a dedicated helper because the KPI
   * is called on every Operations-Summary poll and building the full
   * row projection (with line items, reminders, WhatsApp locks, etc.)
   * would be wasted work.
   *
   * Scope semantics match the list:
   *   - `driverId === userId`           when the caller is a DRIVER,
   *   - driver.branchId | customer.originBranchId when a MANAGER or a
   *     branch filter is set,
   *   - global otherwise.
   *
   * Membership:
   *   - `cashStatus = UNPAID` (pending hosted-link / cash arrears), OR
   *   - `posPaymentMethod = DEBT_ON_ACCOUNT` with still-open FIFO debt
   *     (resolved via the Accountant-canonical ledger allocation).
   */
  async sumCollectionsDebtTotalKd(
    branchId: string | null = null,
    actor?: JwtUser,
  ): Promise<Prisma.Decimal> {
    const isDriver = actor?.role === SafariRole.DRIVER;
    const effectiveBranchId =
      isDriver ? null
      : branchId ??
        (actor?.role === SafariRole.MANAGER && actor.branchId ?
          actor.branchId
        : null);

    const branchWhere: Prisma.OrderWhereInput | undefined = isDriver
      ? { driverId: actor!.userId }
      : effectiveBranchId
        ? {
            OR: [
              { driver: { is: { branchId: effectiveBranchId } } },
              {
                driverId: null,
                customer: { is: { originBranchId: effectiveBranchId } },
              },
            ],
          }
        : undefined;

    const [unpaidAgg, debtCandidates] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          cashStatus: CashStatus.UNPAID,
          status: { not: OrderStatus.CANCELED },
          ...(branchWhere ?? {}),
        },
        _sum: { totalPrice: true },
      }),
      this.prisma.order.findMany({
        where: {
          posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
          status: { not: OrderStatus.CANCELED },
          NOT: { cashStatus: CashStatus.UNPAID },
          ...(branchWhere ?? {}),
        },
        select: { id: true, customerId: true, totalPrice: true },
      }),
    ]);

    const openDebtOrderIds = await this.resolveOpenDebtOrderIds(
      debtCandidates.map((d) => ({
        orderId: d.id,
        customerId: d.customerId,
      })),
    );
    const debtOpenTotal = debtCandidates
      .filter((d) => openDebtOrderIds.has(d.id))
      .reduce(
        (acc, d) => acc.plus(d.totalPrice),
        new Prisma.Decimal(0),
      );

    return (unpaidAgg._sum.totalPrice ?? new Prisma.Decimal(0)).plus(
      debtOpenTotal,
    );
  }

  /**
   * V20.3.1 — partial-payment-aware red KPI.
   *
   * Returns Σ(remaining_balance) over every order that contributes
   * to the Collections / red-debt scope. Differs from
   * {@link sumCollectionsDebtTotalKd} which sums gross
   * `Order.totalPrice` and therefore overstates exposure for any
   * invoice with prior partial payments.
   *
   * Migration plan: dashboards / red KPI / Outstanding header
   * should call this method. The legacy `sumCollectionsDebtTotalKd`
   * stays in place to avoid forcing every consumer to migrate at
   * once. When `V20_3_TRUE_ACCOUNTING=true` the canonical debt
   * value is the journal AR balance — see
   * `JournalSourceService.getCustomerDebtFromJournalAR()` for the
   * per-customer breakdown — but the per-order red KPI still
   * derives from the DebtLedger waterfall here so the operator
   * panel can drill from "red total" to "list of open invoices".
   */
  async sumCollectionsDebtRemainingKd(
    branchId: string | null = null,
    actor?: JwtUser,
  ): Promise<Prisma.Decimal> {
    const isDriver = actor?.role === SafariRole.DRIVER;
    const effectiveBranchId =
      isDriver ? null
      : branchId ??
        (actor?.role === SafariRole.MANAGER && actor.branchId ?
          actor.branchId
        : null);

    const branchWhere: Prisma.OrderWhereInput | undefined = isDriver
      ? { driverId: actor!.userId }
      : effectiveBranchId
        ? {
            OR: [
              { driver: { is: { branchId: effectiveBranchId } } },
              {
                driverId: null,
                customer: { is: { originBranchId: effectiveBranchId } },
              },
            ],
          }
        : undefined;

    const rows = await this.prisma.order.findMany({
      where: {
        status: { not: OrderStatus.CANCELED },
        OR: [
          { cashStatus: CashStatus.UNPAID },
          { posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT },
          { posPaymentMethod: PosPaymentMethod.ONLINE },
          { posPaymentMethod: PosPaymentMethod.PAYMENT_LINK },
        ],
        ...(branchWhere ?? {}),
      },
      select: {
        id: true,
        customerId: true,
        totalPrice: true,
        cashStatus: true,
        posPaymentMethod: true,
      },
    });
    if (rows.length === 0) return new Prisma.Decimal(0);

    const debtCandidates = rows.filter(
      (r) => r.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT,
    );
    const openDebtOrderIds = await this.resolveOpenDebtOrderIds(
      debtCandidates.map((d) => ({
        orderId: d.id,
        customerId: d.customerId,
      })),
    );

    const inScope = rows.filter((r) => {
      if (r.cashStatus === CashStatus.UNPAID) return true;
      if (
        r.posPaymentMethod === PosPaymentMethod.ONLINE ||
        r.posPaymentMethod === PosPaymentMethod.PAYMENT_LINK
      ) {
        return true;
      }
      if (r.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT) {
        return openDebtOrderIds.has(r.id);
      }
      return false;
    });
    if (inScope.length === 0) return new Prisma.Decimal(0);

    const remainingByOrder = await computeOrderRemainingBalancesBatch(
      this.prisma,
      inScope.map((r) => r.id),
    );
    const tol = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);
    let total = new Prisma.Decimal(0);
    for (const r of inScope) {
      const rem = remainingByOrder.get(r.id) ?? r.totalPrice;
      if (rem.lessThanOrEqualTo(tol)) continue;
      total = total.plus(rem);
    }
    return total;
  }

  /**
   * Minimal order rows feeding AR / Outstanding grouping — **same membership**
   * as {@link listUnpaidCollectionOrders} (`filteredRows`). Optional bounds
   * narrow the set for UI filters; omit `createdAt` for all-time (aligns with
   * {@link sumCollectionsDebtTotalKd} / red KPI).
   */
  async listCollectionsReceivableAggOrders(args: {
    branchId: string | null;
    actor?: JwtUser;
    createdAt?: { gte?: Date; lte?: Date };
    driverId?: string;
    customerId?: string;
  }): Promise<
    Array<{
      id: string;
      customerId: string;
      driverId: string | null;
      totalPrice: Prisma.Decimal;
      createdAt: Date;
      dueDate: Date | null;
    }>
  > {
    const { branchId, actor, createdAt, driverId, customerId } = args;
    const isDriver = actor?.role === SafariRole.DRIVER;
    const effectiveBranchId =
      isDriver ? null
      : branchId ??
        (actor?.role === SafariRole.MANAGER && actor.branchId ?
          actor.branchId
        : null);

    const branchWhere: Prisma.OrderWhereInput | undefined = isDriver
      ? { driverId: actor!.userId }
      : effectiveBranchId
        ? {
            OR: [
              { driver: { is: { branchId: effectiveBranchId } } },
              {
                driverId: null,
                customer: { is: { originBranchId: effectiveBranchId } },
              },
            ],
          }
        : undefined;

    const createdFilter =
      createdAt && (createdAt.gte || createdAt.lte)
        ? ({
            createdAt: {
              ...(createdAt.gte ? { gte: createdAt.gte } : {}),
              ...(createdAt.lte ? { lte: createdAt.lte } : {}),
            },
          } satisfies Prisma.OrderWhereInput)
        : {};

    const rows = await this.prisma.order.findMany({
      where: {
        status: { not: OrderStatus.CANCELED },
        OR: [
          { cashStatus: CashStatus.UNPAID },
          { posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT },
          { posPaymentMethod: PosPaymentMethod.ONLINE },
          { posPaymentMethod: PosPaymentMethod.PAYMENT_LINK },
        ],
        ...(branchWhere ?? {}),
        ...createdFilter,
        ...(driverId ? { driverId } : {}),
        ...(customerId ? { customerId } : {}),
      },
      select: {
        id: true,
        customerId: true,
        driverId: true,
        totalPrice: true,
        cashStatus: true,
        posPaymentMethod: true,
        createdAt: true,
        dueDate: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const debtCandidates = rows.filter(
      (r) => r.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT,
    );
    const openDebtOrderIds = await this.resolveOpenDebtOrderIds(
      debtCandidates.map((r) => ({ orderId: r.id, customerId: r.customerId })),
    );
    const remainingByOrder = await computeOrderRemainingBalancesBatch(
      this.prisma,
      rows.map((r) => r.id),
    );
    const tol = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);

    return rows
      .filter((r) => {
        const rem = remainingByOrder.get(r.id) ?? r.totalPrice;
        if (rem.lessThanOrEqualTo(tol)) return false;
        if (r.cashStatus === CashStatus.UNPAID) return true;
        if (
          r.posPaymentMethod === PosPaymentMethod.ONLINE ||
          r.posPaymentMethod === PosPaymentMethod.PAYMENT_LINK
        ) {
          return true;
        }
        if (r.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT) {
          return openDebtOrderIds.has(r.id);
        }
        return false;
      })
      .map((r) => ({
        id: r.id,
        customerId: r.customerId,
        driverId: r.driverId,
        totalPrice: r.totalPrice,
        createdAt: r.createdAt,
        dueDate: r.dueDate,
      }));
  }

  /**
   * Whether an order contributes to the Collections / market-debt totals for
   * a customer — **byte-identical** to the filter in {@link listUnpaidCollectionOrders}
   * (`filteredRows`). UNPAID rows always count; DEBT_ON_ACCOUNT rows only while
   * FIFO says the invoice is still open.
   */
  private isOrderInCollectionsUncollectedScope(
    r: {
      id: string;
      cashStatus: CashStatus;
      posPaymentMethod: PosPaymentMethod | null;
    },
    debtOnAccountStillOpenIds: Set<string>,
  ): boolean {
    if (r.cashStatus === CashStatus.UNPAID) return true;
    if (
      r.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT &&
      debtOnAccountStillOpenIds.has(r.id)
    ) {
      return true;
    }
    return false;
  }

  /**
   * Single DB pass: total KD + order ids that count as Collections debt for
   * this customer (same filter as {@link listUnpaidCollectionOrders}).
   */
  async getCollectionsReceivableSnapshotForCustomer(
    customerId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{
    totalKd: Prisma.Decimal;
    /**
     * V20.3.1 — Σ(remaining_balance) over the same in-scope rows.
     * Differs from `totalKd` whenever an in-scope invoice has prior
     * partial payments. Use this for red KPI / Outstanding header /
     * collections views; `totalKd` is preserved for callers that
     * still need the gross figure.
     */
    remainingKd: Prisma.Decimal;
    openOrderIds: Set<string>;
  }> {
    const db = tx ?? this.prisma;
    const rows = await db.order.findMany({
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
        customerId: true,
        totalPrice: true,
        cashStatus: true,
        posPaymentMethod: true,
      },
    });
    const debtCandidates = rows.filter(
      (r) => r.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT,
    );
    const openDebtOrderIds = await this.resolveOpenDebtOrderIds(
      debtCandidates.map((r) => ({
        orderId: r.id,
        customerId: r.customerId,
      })),
      db,
    );
    let totalKd = new Prisma.Decimal(0);
    const openOrderIds = new Set<string>();
    const inScopeIds: string[] = [];
    for (const r of rows) {
      if (!this.isOrderInCollectionsUncollectedScope(r, openDebtOrderIds)) {
        continue;
      }
      totalKd = totalKd.plus(r.totalPrice);
      openOrderIds.add(r.id);
      inScopeIds.push(r.id);
    }
    let remainingKd = new Prisma.Decimal(0);
    if (inScopeIds.length > 0) {
      const remainingByOrder = await computeOrderRemainingBalancesBatch(
        db,
        inScopeIds,
      );
      const tol = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);
      for (const id of inScopeIds) {
        const rem = remainingByOrder.get(id);
        if (!rem || rem.lessThanOrEqualTo(tol)) continue;
        remainingKd = remainingKd.plus(rem);
      }
    }
    return { totalKd, remainingKd, openOrderIds };
  }

  /**
   * Σ `totalPrice` for every non-canceled invoice for this customer that would
   * appear on `/collections` (الفواتير غير المحصّلة) — same scope as
   * {@link sumCollectionsDebtTotalKd} but for one `customerId`.
   */
  async sumCollectionsReceivableKdForCustomer(
    customerId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Prisma.Decimal> {
    const { totalKd } =
      await this.getCollectionsReceivableSnapshotForCustomer(customerId, tx);
    return totalKd;
  }

  /**
   * Operational debt basis for subscriber totals, Call Center conversion /
   * partial-pay copy, and `activateSubscriptionPlan`.
   *
   * This is NOT the canonical financial number for Customer 360. Canonical
   * customer financial totals come only from `computeCustomerFinancials()`.
   *
   * - **`operationalDebtKd`**: **أعلى** القيم الثلاث حتى لا يظهر رقم أقل من أي
   *   مرجع يعتمد عليه الموظف:
   *   1) صافي أستاذ الديون (`DebtLedgerEntry`، نفس شلال «ذمم دفتر الالتزام»)،
   *   2) `getCustomerDebtSnapshot.totalDebt` (دين المحفظة + زيادة استعمال الاشتراك)،
   *   3) مجموع نطاق التحصيل التقليدي: `wallet.debt + Σ` فواتير التحصيل
   *      ({@link getCollectionsReceivableSnapshotForCustomer}) — يطابق الصفوف في
   *      «تقرير تتبع الديون» عندما تُجمع ذمم الفواتير مع عمود المحفظة.
   * - **`collectionsReceivableKd`**: `max(operationalDebtKd − walletDebtKd, 0)`.
   *
   * Pass `embeddedWalletDebt` when `customer.wallet` is already loaded so the
   * wallet row cannot diverge from the serialized `debt` column.
   */
  async getOperationalDebtKdBreakdown(
    customerId: string,
    embeddedWalletDebt?: Prisma.Decimal | null,
    tx?: Prisma.TransactionClient,
  ): Promise<{
    walletDebtKd: Prisma.Decimal;
    collectionsReceivableKd: Prisma.Decimal;
    operationalDebtKd: Prisma.Decimal;
    collectionsOpenOrderIds: Set<string>;
    /** Present when env `EXPOSE_DEBT_BREAKDOWN=1`: three inputs + winners. */
    trace?: DebtKdBreakdownTrace;
  }> {
    const db = tx ?? this.prisma;
    let walletDebtKd: Prisma.Decimal;
    if (embeddedWalletDebt !== undefined) {
      walletDebtKd =
        embeddedWalletDebt ?? new Prisma.Decimal(0);
    } else {
      const row = await db.customerWallet.findUnique({
        where: { customerId },
        select: { debt: true },
      });
      walletDebtKd = row?.debt ?? new Prisma.Decimal(0);
    }

    const ledgerOpen = await getCustomerNetDebtFromDebtLedgerAgg(db, customerId);
    const snapshotFromWalletKd = await getCustomerDebtSnapshotTotalKd(
      db,
      customerId,
    );
    const collectionsSnap = await this.getCollectionsReceivableSnapshotForCustomer(
      customerId,
      tx,
    );
    const z = new Prisma.Decimal(0);
    const ledgerNetKd = ledgerOpen.netOpenDebtKd;
    /** نفس «قديم effective»: دين المحفظة + ذمم التحصيل الظاهرة في القائمة. */
    const orderMarketScopeKd = walletDebtKd.plus(collectionsSnap.totalKd);

    // V20.1 → V22 — Operational debt double-count fix.
    //
    // Legacy behaviour: `operationalDebtKd = max(ledgerNet, walletSnapshot,
    // walletDebt + Σ Order.totalPrice of open DEBT_ON_ACCOUNT)`. The
    // third term double-counts: `walletDebt` already reflects the
    // post-wallet shortfall, while `collectionsSnap.totalKd` adds the
    // FULL `Order.totalPrice` of every open DEBT_ON_ACCOUNT row. For a
    // customer with walletDebt=30.250 and one open debt-on-account
    // invoice for 30.250, the customer card reported 60.500.
    //
    // V22 makes the ledger/wallet path final because the canonical
    // sources (`DebtLedgerEntry` and the wallet snapshot) already carry
    // the receivable once. The old inflated comparator is fully retired.
    const operationalDebtKd = resolveOperationalDebtKd({
      ledgerNetKd,
      snapshotFromWalletKd,
      orderMarketScopeKd,
    });

    const collectionsReceivableKd = Prisma.Decimal.max(
      operationalDebtKd.sub(walletDebtKd),
      z,
    );

    const unpaidIds = await db.order.findMany({
      where: {
        customerId,
        status: { not: OrderStatus.CANCELED },
        cashStatus: CashStatus.UNPAID,
      },
      select: { id: true },
    });
    const collectionsOpenOrderIds = new Set<string>(collectionsSnap.openOrderIds);
    for (const u of unpaidIds) {
      collectionsOpenOrderIds.add(u.id);
    }

    const expose =
      process.env.EXPOSE_DEBT_BREAKDOWN?.trim().toLowerCase() === '1' ||
      process.env.EXPOSE_DEBT_BREAKDOWN?.trim().toLowerCase() === 'true';
    let trace: DebtKdBreakdownTrace | undefined;
    if (expose) {
      trace = buildDebtKdBreakdownTrace(
        ledgerNetKd,
        snapshotFromWalletKd,
        orderMarketScopeKd,
        operationalDebtKd,
      );
      this.log.warn(
        `[debtKdBreakdown] customerId=${customerId} ledger=${trace.ledgerNetKd} walletSnap=${trace.walletSnapshotKd} orderMarket=${trace.orderMarketScopeKd} operational=${trace.operationalDebtKd} winners=[${trace.winningSources.join(',')}]`,
      );
    }

    return {
      walletDebtKd,
      collectionsReceivableKd,
      operationalDebtKd,
      collectionsOpenOrderIds,
      trace,
    };
  }

  /** Every order id for this customer that is still counted as Collections debt. */
  async getCollectionsOpenOrderIdsForCustomer(
    customerId: string,
  ): Promise<Set<string>> {
    const { openOrderIds } =
      await this.getCollectionsReceivableSnapshotForCustomer(customerId);
    return openOrderIds;
  }

  /**
   * Canonical collections charge for one invoice — matches the amount shown
   * in the CC debt table (`listUnpaidCollectionOrders` → `amountKd`).
   */
  async getCollectionChargeKdForOrder(orderId: string): Promise<string> {
    const rows = await this.listUnpaidCollectionOrders(null, undefined);
    const row = rows.find((r) => r.orderId === orderId);
    if (!row) {
      throw new BadRequestException(
        'Order is not open for collection (settled, canceled, or not found).',
      );
    }
    return row.amountKd;
  }

  /**
   * Itemized open debt for CC «full balance» links — amounts match the
   * collections table; `reasonAr` explains each line for customer trust.
   */
  async getCustomerCollectionDebtBreakdown(customerId: string): Promise<{
    customerId: string;
    customerName: string;
    customerPhone: string;
    totalDebtKd: string;
    lines: Array<{
      orderId: string;
      readableId: string;
      invoiceNumber: string | null;
      amountKd: string;
      paymentMethod: PosPaymentMethod | null;
      orderDateIso: string;
      reasonAr: string;
    }>;
  }> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        displayName: true,
        phone: true,
        phone2: true,
      },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const visible = await this.debtVisibility.getCustomerVisibleDebt(customerId);
    const rows = await this.listUnpaidCollectionOrders(
      null,
      undefined,
      customerId,
    );

    const phone =
      customer.phone?.replace(/[\s-]/g, '').trim() ||
      customer.phone2?.replace(/[\s-]/g, '').trim() ||
      '';

    return {
      customerId: customer.id,
      customerName: customer.displayName?.trim() || phone || 'Customer',
      customerPhone: phone,
      totalDebtKd: visible.remainingDebtKd,
      lines: rows.map((r) => ({
        orderId: r.orderId,
        readableId: r.readableId,
        invoiceNumber: r.invoiceNumber,
        amountKd: r.amountKd,
        paymentMethod: r.paymentMethod,
        orderDateIso: r.createdAtIso,
        reasonAr: collectionDebtReasonAr(
          r.paymentMethod,
          r.createdAtIso,
          r.invoiceNumber,
          r.readableId,
        ),
      })),
    };
  }

  /**
   * Single unpaid row for server-side payment-link WhatsApp (Moatmt / webhook),
   * using the same projection as {@link listUnpaidCollectionOrders}.
   */
  async getUnpaidCollectionOrderRowForWhatsappText(
    orderId: string,
  ): Promise<{
    orderId: string;
    readableId: string;
    invoiceNumber: string | null;
    customerName: string;
    /** Compact digits — same as collections list `customerPhone`. */
    customerPhone: string;
    customerPhone2: string | null;
    amountKd: string;
    lineItems: {
      label: string | null;
      quantity: string;
      lineTotalKd: string;
    }[];
    branchName: string | null;
    driverName: string | null;
  } | null> {
    let amountKd: string;
    try {
      amountKd = await this.getCollectionChargeKdForOrder(orderId);
    } catch {
      return null;
    }
    const r = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        status: { not: OrderStatus.CANCELED },
      },
      select: {
        id: true,
        serialNumber: true,
        invoiceNumber: true,
        totalPrice: true,
        customer: {
          select: {
            displayName: true,
            phone: true,
            phone2: true,
            originBranch: { select: { name: true } },
          },
        },
        driver: {
          select: {
            fullName: true,
            branch: { select: { name: true } },
          },
        },
        lineItems: {
          select: {
            label: true,
            quantity: true,
            unitPrice: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!r) {
      return null;
    }
    const phone =
      r.customer.phone?.replace(/[\s-]/g, '').trim() ||
      r.customer.phone2?.replace(/[\s-]/g, '').trim() ||
      '';
    const name =
      r.customer.displayName?.trim() || (phone ? phone : 'Customer');
    const readableId =
      r.serialNumber?.trim() ||
      r.invoiceNumber?.trim() ||
      `#${r.id.slice(-6).toUpperCase()}`;
    const lineItems = r.lineItems.map((li) => {
      const lineTotal = li.quantity.mul(li.unitPrice);
      return {
        label: li.label,
        quantity: li.quantity.toString(),
        lineTotalKd: lineTotal.toFixed(3),
      };
    });
    const branchName =
      r.driver?.branch?.name?.trim() ||
      r.customer.originBranch?.name?.trim() ||
      null;
    const driverName = r.driver?.fullName?.trim() || null;
    return {
      orderId: r.id,
      readableId,
      invoiceNumber: r.invoiceNumber ?? null,
      customerName: name,
      customerPhone: phone,
      customerPhone2:
        r.customer.phone2?.replace(/[\s-]/g, '').trim() || null,
      amountKd,
      lineItems,
      branchName,
      driverName,
    };
  }

  /**
   * Given a set of candidate `(orderId, customerId)` tuples representing
   * DEBT_ON_ACCOUNT orders, return the subset of orderIds that are STILL
   * open after FIFO-allocating the customer's payments across ALL of
   * their SHORTFALL invoices (not just the ones in the candidate list).
   *
   * Used by the Driver Field Collection Tracker so settled debts vanish
   * from the driver's list the moment the ledger says the customer is
   * current. The algorithm mirrors
   * `DebtService.getUnpaidInvoices()` (the Accountant's canonical source
   * of truth) to guarantee both surfaces agree on "is this invoice still
   * open?" without physically sharing code paths.
   */
  async resolveOpenDebtOrderIds(
    candidates: { orderId: string; customerId: string }[],
    db: PrismaOrderDb = this.prisma,
  ): Promise<Set<string>> {
    const openIds = new Set<string>();
    if (candidates.length === 0) return openIds;

    const orderIds = candidates.map((c) => c.orderId);
    const remainingByOrder = await computeOrderRemainingBalancesBatch(db, orderIds);
    const tol = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);
    for (const { orderId } of candidates) {
      const rem = remainingByOrder.get(orderId) ?? new Prisma.Decimal(0);
      if (rem.greaterThan(tol)) openIds.add(orderId);
    }
    return openIds;
  }

  /**
   * V1.5.6 — "Market Debt Total" used by Call Center KPI card.
   * Pure SUM over the same rows that feed the Debt-Tracking table so
   * the cell-sum and card-sum are identical by construction.
   */
  async sumUnpaidCollectionAmount(): Promise<Prisma.Decimal> {
    const agg = await this.prisma.order.aggregate({
      _sum: { totalPrice: true },
      where: {
        cashStatus: CashStatus.UNPAID,
        status: { not: OrderStatus.CANCELED },
      },
    });
    return agg._sum.totalPrice ?? new Prisma.Decimal(0);
  }
}
