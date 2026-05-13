import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CashStatus,
  LedgerTransactionType,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
  SafariRole,
} from '@prisma/client';
import { DebtEntityCategory } from '../enums/debt-entity-category.enum';
import type { MarketUnpaidByMethodDto } from '../dto/unpaid-invoices.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionService } from './subscription.service';
import type {
  UnpaidInvoiceRowDto,
  UnpaidInvoicesQueryDto,
  UnpaidInvoicesResponseDto,
} from '../dto/unpaid-invoices.dto';
import type {
  OpenDebtByIssuerResponseDto,
  OpenDebtByIssuerRowDto,
} from '../dto/open-debt-by-issuer.dto';
import {
  computeOrderRemainingBalancesBatch,
  getCustomerNetDebtFromDebtLedgerAgg,
  INVOICE_REMAINING_TOLERANCE_KD,
  isJournalAsSourceEnabled,
  isV20_3TrueAccountingEnabled,
} from '../debt-customer-aggregates.util';
import { JournalSourceService } from '../../general-ledger/journal-source.service';
import { PaymentsService } from '../../common/services/payments.service';
import { CustomerNotificationsService } from '../../customer-notifications/customer-notifications.service';
import { resolveCustomerPhoneForNotify } from '../../common/validation/kuwait-customer-phone';
import { buildCollectionsPaymentLinkTextAr } from '../../call-center/collections-whatsapp-text';
import { getCustomerSubscriptionStateBatch } from '../../subscribers/subscription-state.util';
import { attachCanonicalRunningRemaining } from '../canonical-financial-projection';

/**
 * Same branch scoping as `CallCenterService.getOperationsSummary` red KPI
 * (`order.aggregate` on UNPAID orders). Driver branch OR customer origin.
 */
function orderBranchWhereForMarketDebt(
  branchId: string | null | undefined,
): Prisma.OrderWhereInput | undefined {
  const b = branchId?.trim();
  if (!b) return undefined;
  return {
    OR: [
      { driver: { is: { branchId: b } } },
      {
        driverId: null,
        customer: { is: { originBranchId: b } },
      },
    ],
  };
}

function foldMarketUnpaidByMethod(
  groups: Array<{
    posPaymentMethod: PosPaymentMethod | null;
    _sum: { totalPrice: Prisma.Decimal | null };
  }>,
): MarketUnpaidByMethodDto {
  let cash = 0;
  let knet = 0;
  let online = 0;
  let link = 0;
  let other = 0;
  for (const g of groups) {
    const n = Number.parseFloat(
      (g._sum.totalPrice ?? new Prisma.Decimal(0)).toString(),
    );
    if (!Number.isFinite(n) || n === 0) continue;
    const p = g.posPaymentMethod;
    if (p === PosPaymentMethod.CASH) cash += n;
    else if (p === PosPaymentMethod.KNET) knet += n;
    else if (p === PosPaymentMethod.ONLINE) online += n;
    else if (p === PosPaymentMethod.PAYMENT_LINK) link += n;
    else other += n;
  }
  const f = (x: number) => x.toFixed(4);
  return {
    cashKd: f(cash),
    knetKd: f(knet),
    onlineKd: f(online),
    paymentLinkKd: f(link),
    otherKd: f(other),
  };
}

@Injectable()
export class DebtService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
    private readonly journalSource: JournalSourceService,
    private readonly paymentsService: PaymentsService,
    private readonly customerNotifications: CustomerNotificationsService,
  ) {}

  async getOwnerCustomerWalletSummary() {
    const agg = await this.prisma.customerWallet.aggregate({
      _sum: { balance: true, debt: true },
    });
    const negativeBalanceRows = await this.prisma.customerWallet.findMany({
      where: { balance: { lt: 0 } },
      select: { balance: true },
    });
    const subscriptionDebt = negativeBalanceRows.reduce((acc, row) => {
      const x = Number.parseFloat(row.balance.toString());
      if (!Number.isFinite(x) || x >= 0) return acc;
      return acc + Math.abs(x);
    }, 0);
    const debtFromIssuedInvoices = 0;
    const debtFromSubscriptionOveruse = 0;
    const debtByBranch = 0;
    const debtByDriver = 0;
    const debtByOwner = 0;
    const debtByCallCenter = 0;
    const standardInvoiceDebt = Number.parseFloat(
      agg._sum.debt !== null && agg._sum.debt !== undefined
        ? agg._sum.debt.toString()
        : '0',
    );
    const sub = await this.subscriptionService.getUsageAndSettledDebtTotals();
    return {
      totalWalletLiabilities:
        agg._sum.balance !== null && agg._sum.balance !== undefined
          ? agg._sum.balance.toString()
          : '0',
      totalCustomerDebts: (standardInvoiceDebt + subscriptionDebt).toFixed(4),
      debtFromIssuedInvoices: debtFromIssuedInvoices.toFixed(4),
      debtFromSubscriptionOveruse: debtFromSubscriptionOveruse.toFixed(4),
      debtSettledBySubscriptions: sub.debtSettledBySubscriptions,
      debtByBranch: debtByBranch.toFixed(4),
      debtByDriver: debtByDriver.toFixed(4),
      debtByOwner: debtByOwner.toFixed(4),
      debtByCallCenter: debtByCallCenter.toFixed(4),
      totalSubscriptionUsage: sub.totalSubscriptionUsage,
    };
  }

  async getDebtBreakdownByCategory(
    fromIso: string,
    toIso: string,
    _category?: DebtEntityCategory,
    _branchId?: string,
    _actorUserId?: string,
  ) {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid date range');
    }
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      rows: [] as Array<{
        category: string | null;
        source: string;
        entryCount: number;
        totalDebt: string;
      }>,
    };
  }

  async getTotalDebt(): Promise<string> {
    const s = await this.getOwnerCustomerWalletSummary();
    return s.totalCustomerDebts;
  }

  /**
   * V25 — Customers with collectible invoice balance but no active hosted link.
   *
   * Server-authoritative aggregation:
   * - universe: invoices not canceled (`Order.status!=CANCELED`)
   * - remaining per invoice: `Order.totalPrice - applied payments` (partial-aware)
   * - excluded rows: invoices with active hosted links (duplicate-link guard)
   * - grouped by customer: Σ remaining balance with KWD 3dp precision
   */
  async getOutstandingDebtsWithoutLinks(
    branchId: string | null = null,
  ): Promise<
    Array<{
      customerId: string;
      customerName: string;
      remainingDueKd: string;
      lastOrderDate: string | null;
      invoices: Array<{
        invoiceId: string;
        invoiceLabel: string;
        amountKd: string;
        originalTotalKd: string;
        remainingBalanceKd: string;
        settlementStatus: 'UNPAID' | 'PARTIAL';
        issuedAt: string;
      }>;
    }>
  > {
    const branchWhere = orderBranchWhereForMarketDebt(branchId ?? undefined);

    const openInvoices = await this.prisma.order.findMany({
      where: {
        status: { not: OrderStatus.CANCELED },
        ...(branchWhere ?? {}),
      },
      select: {
        id: true,
        customerId: true,
        serialNumber: true,
        invoiceNumber: true,
        totalPrice: true,
        posPaymentMethod: true,
        posHostedPaymentUrl: true,
        createdAt: true,
      },
      orderBy: [{ customerId: 'asc' }, { createdAt: 'asc' }],
    });

    if (openInvoices.length === 0) {
      return [];
    }

    const customerIds = Array.from(new Set(openInvoices.map((o) => o.customerId)));
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: {
        id: true,
        displayName: true,
        phone: true,
      },
    });
    const customerNameById = new Map(
      customers.map((c) => [c.id, c.displayName?.trim() || c.phone || '—']),
    );
    const remainingByOrder = await computeOrderRemainingBalancesBatch(
      this.prisma,
      openInvoices.map((o) => o.id),
    );
    const tol = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);

    const byCustomer = new Map<
      string,
      {
        total: Prisma.Decimal;
        lastOrderDate: Date | null;
        invoices: Array<{
          invoiceId: string;
          invoiceLabel: string;
          amountKd: string;
          originalTotalKd: string;
          remainingBalanceKd: string;
          settlementStatus: 'UNPAID' | 'PARTIAL';
          issuedAt: string;
        }>;
      }
    >();

    for (const order of openInvoices) {
      const remaining = remainingByOrder.get(order.id) ?? new Prisma.Decimal(0);
      if (remaining.lessThanOrEqualTo(tol)) {
        continue;
      }
      // @V25-QUARANTINE: duplicate link guard is applied per invoice row.
      // If this invoice already has an active hosted link, it stays hidden.
      if (order.posHostedPaymentUrl?.trim()) {
        continue;
      }
      // Keep LINK/ONLINE invoices in the payment-link follow-up rail
      // (Collections report "روابط الدفع غير المحصّلة"), not in
      // the "without links" settlement rail.
      if (
        order.posPaymentMethod === PosPaymentMethod.PAYMENT_LINK ||
        order.posPaymentMethod === PosPaymentMethod.ONLINE
      ) {
        continue;
      }
      const bucket = byCustomer.get(order.customerId) ?? {
        total: new Prisma.Decimal(0),
        lastOrderDate: null,
        invoices: [],
      };
      bucket.total = bucket.total.add(remaining);
      if (
        !bucket.lastOrderDate ||
        order.createdAt.getTime() > bucket.lastOrderDate.getTime()
      ) {
        bucket.lastOrderDate = order.createdAt;
      }
      bucket.invoices.push({
        invoiceId: order.id,
        invoiceLabel:
          order.serialNumber?.trim() ||
          order.invoiceNumber?.trim() ||
          `#${order.id.slice(-6).toUpperCase()}`,
        amountKd: remaining.toFixed(4),
        originalTotalKd: order.totalPrice.toFixed(4),
        remainingBalanceKd: remaining.toFixed(4),
        settlementStatus: remaining.lessThan(order.totalPrice) ? 'PARTIAL' : 'UNPAID',
        issuedAt: order.createdAt.toISOString(),
      });
      byCustomer.set(order.customerId, bucket);
    }

    return Array.from(byCustomer.entries())
      .map(([customerId, bucket]) => {
        return {
          customerId,
          customerName: customerNameById.get(customerId) ?? '—',
          remainingDueKd: bucket.total.toFixed(4),
          lastOrderDate: bucket.lastOrderDate?.toISOString() ?? null,
          invoices: bucket.invoices,
        };
      })
      .filter((row) => new Prisma.Decimal(row.remainingDueKd).gt(0))
      .sort((a, b) =>
        new Prisma.Decimal(b.remainingDueKd).comparedTo(new Prisma.Decimal(a.remainingDueKd)),
      );
  }

  async generateSettlementLink(params: {
    customerId: string;
    invoiceIds: string[];
    actorUserId: string;
  }): Promise<{
    bundleId: string;
    customerId: string;
    invoiceIds: string[];
    invoiceCount: number;
    totalAmountKd: string;
    paymentUrl: string;
    trackId: string | null;
    serverPush: boolean;
  }> {
    const customerId = params.customerId.trim();
    const invoiceIds = Array.from(
      new Set(params.invoiceIds.map((id) => id.trim()).filter(Boolean)),
    );
    if (!customerId) {
      throw new BadRequestException('customerId is required');
    }
    if (invoiceIds.length === 0) {
      throw new BadRequestException('invoiceIds must contain at least one id');
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        phone: true,
        phone2: true,
        displayName: true,
      },
    });
    if (!customer) {
      throw new BadRequestException('Customer not found');
    }

    const selectedOrders = await this.prisma.order.findMany({
      where: { id: { in: invoiceIds } },
      select: {
        id: true,
        customerId: true,
        status: true,
        totalPrice: true,
        posHostedPaymentUrl: true,
        posPaymentBundleId: true,
        serialNumber: true,
        invoiceNumber: true,
        createdAt: true,
      },
    });
    if (selectedOrders.length !== invoiceIds.length) {
      throw new BadRequestException('Some invoiceIds do not exist');
    }
    const remainingByOrder = await computeOrderRemainingBalancesBatch(
      this.prisma,
      selectedOrders.map((o) => o.id),
    );
    const tol = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);

    for (const order of selectedOrders) {
      if (order.customerId !== customerId) {
        throw new BadRequestException(
          'All selected invoiceIds must belong to the provided customerId',
        );
      }
      if (order.status === OrderStatus.CANCELED) {
        throw new BadRequestException(
          `Invoice ${order.id} is canceled and cannot be settled`,
        );
      }
      if (order.posHostedPaymentUrl?.trim()) {
        throw new BadRequestException(
          `Invoice ${order.id} already has an active payment link`,
        );
      }
      if (order.posPaymentBundleId) {
        throw new BadRequestException(
          `Invoice ${order.id} is already linked to another settlement bundle`,
        );
      }
      const remaining = remainingByOrder.get(order.id) ?? new Prisma.Decimal(0);
      if (remaining.lessThanOrEqualTo(tol)) {
        throw new BadRequestException(`Invoice ${order.id} has no remaining balance`);
      }
    }

    const totalAmount = selectedOrders.reduce(
      (acc, row) =>
        acc.add(remainingByOrder.get(row.id) ?? new Prisma.Decimal(0)),
      new Prisma.Decimal(0),
    );
    if (totalAmount.lte(0)) {
      throw new BadRequestException('Selected invoice total must be greater than zero');
    }

    const customerPhone = resolveCustomerPhoneForNotify(customer.phone, customer.phone2);
    if (!customerPhone.trim()) {
      throw new BadRequestException(
        'No customer phone available to send the settlement link',
      );
    }

    const bundleId = await this.prisma.$transaction(async (tx) => {
      const bundle = await tx.posPaymentBundle.create({
        data: {
          driverId: params.actorUserId,
          totalAmountKd: totalAmount,
        },
        select: { id: true },
      });
      const claim = await tx.order.updateMany({
        where: {
          id: { in: invoiceIds },
          customerId,
          status: { not: OrderStatus.CANCELED },
          posHostedPaymentUrl: null,
          posPaymentBundleId: null,
        },
        data: {
          posPaymentBundleId: bundle.id,
        },
      });
      if (claim.count !== invoiceIds.length) {
        throw new BadRequestException(
          'Some invoices changed state during settlement generation; refresh and retry',
        );
      }
      return bundle.id;
    });

    let paymentLink: { url: string; trackId?: string };
    try {
      paymentLink = await this.paymentsService.createPaymentLink({
        orderId: bundleId,
        amount: totalAmount,
        customerPhone,
        customerName: customer.displayName ?? undefined,
        customerUniqueId: customer.id.slice(0, 20),
      });
    } catch (error) {
      await this.prisma.$transaction(async (tx) => {
        await tx.order.updateMany({
          where: { id: { in: invoiceIds }, posPaymentBundleId: bundleId },
          data: { posPaymentBundleId: null },
        });
        await tx.posPaymentBundle.delete({ where: { id: bundleId } });
      });
      throw error;
    }

    const nowIso = new Date().toISOString();
    await this.prisma.order.updateMany({
      where: { id: { in: invoiceIds }, posPaymentBundleId: bundleId },
      data: {
        posHostedPaymentUrl: paymentLink.url,
        posGatewayTrackId: paymentLink.trackId ?? null,
        ccCollectionPaymentWaLocked: true,
        posGatewayMetadata: {
          charge: {
            provider: 'upayments',
            trackId: paymentLink.trackId ?? null,
            link: paymentLink.url,
            createdAt: nowIso,
            source: 'finance.generateSettlementLink',
          },
          settlement: {
            kind: 'multi_invoice',
            bundleId,
            customerId,
            invoiceIds,
            invoiceCount: invoiceIds.length,
            totalAmountKd: totalAmount.toFixed(4),
            createdAt: nowIso,
          },
        } as Prisma.InputJsonValue,
      },
    });

    const message = buildCollectionsPaymentLinkTextAr(
      {
        orderId: bundleId,
        readableId: `SET-${bundleId.slice(-6).toUpperCase()}`,
        invoiceNumber: null,
        customerName: customer.displayName?.trim() || customer.phone || 'عميلنا العزيز',
        amountKd: totalAmount.toFixed(4),
        lineItems: selectedOrders
          .slice()
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((order) => ({
            label: (() => {
              const invoiceRef =
                order.serialNumber?.trim() ||
                order.invoiceNumber?.trim() ||
                `فاتورة ${order.id.slice(-6).toUpperCase()}`;
              const remaining = remainingByOrder
                .get(order.id)
                ?.toFixed(4);
              const original = order.totalPrice.toFixed(4);
              return remaining && remaining !== original
                ? `${invoiceRef} (الأصلي ${original} / المتبقي ${remaining})`
                : invoiceRef;
            })(),
            quantity: '1',
            lineTotalKd: (
              remainingByOrder.get(order.id) ?? new Prisma.Decimal(0)
            ).toFixed(4),
          })),
        branchName: null,
        driverName: null,
      },
      paymentLink.url,
    );
    let serverPush = false;
    try {
      serverPush = await this.customerNotifications.deliverCollectionsPaymentLinkNow(
        {
          customerPhone,
          orderId: selectedOrders[0]?.id ?? bundleId,
          message,
        },
      );
    } catch {
      serverPush = false;
    }

    return {
      bundleId,
      customerId,
      invoiceIds,
      invoiceCount: invoiceIds.length,
      totalAmountKd: totalAmount.toFixed(4),
      paymentUrl: paymentLink.url,
      trackId: paymentLink.trackId ?? null,
      serverPush,
    };
  }

  async getCustomerDebtSnapshot(customerId: string): Promise<{
    walletDebt: string;
    subscriptionOveruseDebt: string;
    totalDebt: string;
    /**
     * V20.3.1 — when `V20_3_TRUE_ACCOUNTING=true`, this is the
     * journal AR balance (clamped at 0). Otherwise undefined.
     * Surfaced additively so existing UIs can switch to it
     * without breaking the back-compat fields above.
     */
    journalArDebtKd?: string;
    /** V20.3.1 — which source backed `totalDebt`. */
    debtSource?: 'JOURNAL_AR' | 'WALLET';
    /**
     * V20.3.2 — independent subscription dimension. True iff a
     * `CustomerSubscription` row exists with `status === ACTIVE`
     * AND `expiresAt > now`. Having debt does NOT make a
     * customer a subscriber, and vice-versa.
     */
    hasActiveSubscription?: boolean;
    /**
     * V20.3.2 — ISO expiry timestamp of the active subscription.
     * Null when the customer has no active subscription row.
     */
    subscriptionExpiresAt?: string | null;
  }> {
    const wallet = await this.prisma.customerWallet.findUnique({
      where: { customerId },
      select: { balance: true, debt: true },
    });
    const walletDebt = Number.parseFloat(wallet?.debt?.toString?.() ?? '0');
    const balance = Number.parseFloat(wallet?.balance?.toString?.() ?? '0');
    const subscriptionOveruseDebt =
      Number.isFinite(balance) && balance < 0 ? Math.abs(balance) : 0;
    const walletTotalDebt =
      (Number.isFinite(walletDebt) ? walletDebt : 0) + subscriptionOveruseDebt;

    // V20.3 — Phase 35. When the operator opts into the true
    // accounting model, the canonical debt is the live AR balance
    // on account 1300, not the wallet.debt snapshot. We still
    // expose the wallet figure for back-compat (the dual-write
    // remains active), but `totalDebt` follows the journal so
    // collections / debt views show the same number as the
    // journal-based audit endpoints.
    let journalArDebtKd: string | undefined;
    let totalDebt = walletTotalDebt;
    let debtSource: 'JOURNAL_AR' | 'WALLET' = 'WALLET';
    if (isV20_3TrueAccountingEnabled()) {
      try {
        const arBal =
          await this.journalSource.getCustomerDebtFromJournalAR(customerId);
        const arBalNum = Number.parseFloat(arBal.toString());
        if (Number.isFinite(arBalNum)) {
          journalArDebtKd = arBalNum.toFixed(4);
          totalDebt = arBalNum;
          debtSource = 'JOURNAL_AR';
        }
      } catch {
        // Journal read failures are non-fatal — fall back to the
        // wallet figure so the customer 360 panel keeps rendering.
      }
    }

    // V20.3.2 — independent subscription state. Read here so
    // every Customer 360 / debt-snapshot consumer gets the same
    // canonical "is currently a subscriber" answer without
    // having to hit a second endpoint. Failure is non-fatal —
    // the snapshot still renders without the subscription badge.
    let hasActiveSubscription: boolean | undefined;
    let subscriptionExpiresAt: string | null | undefined;
    try {
      const subs = await getCustomerSubscriptionStateBatch(this.prisma, [
        customerId,
      ]);
      const state = subs.get(customerId);
      hasActiveSubscription = state?.isActiveSubscriber ?? false;
      subscriptionExpiresAt = state?.subscriptionExpiresAtIso ?? null;
    } catch {
      // ignore — additive field, never blocks the snapshot
    }

    return {
      walletDebt: (Number.isFinite(walletDebt) ? walletDebt : 0).toFixed(4),
      subscriptionOveruseDebt: subscriptionOveruseDebt.toFixed(4),
      totalDebt: totalDebt.toFixed(4),
      journalArDebtKd,
      debtSource,
      hasActiveSubscription,
      subscriptionExpiresAt,
    };
  }

  /**
   * Settles driver cash liability by moving completed CASH orders
   * from PAID_TO_DRIVER -> HANDED_OVER_TO_OFFICE up to approved amount.
   */
  async applyDriverDepositSettlement(
    driverId: string,
    approvedAmountKd: number,
    /**
     * V25 Journal Enforcement — optional Prisma transaction client.
     * When provided, the cash-status flip is performed atomically inside
     * the caller's transaction so the deposit approval and the order
     * settlement cannot partially commit independently.
     */
    tx?: Prisma.TransactionClient,
  ): Promise<{ settledAmountKd: string; settledOrderCount: number }> {
    const db = tx ?? this.prisma;
    const amount = Number.isFinite(approvedAmountKd) && approvedAmountKd > 0 ? approvedAmountKd : 0;
    if (amount <= 0) {
      return { settledAmountKd: '0.0000', settledOrderCount: 0 };
    }
    const pending = await db.order.findMany({
      where: {
        driverId,
        status: OrderStatus.COMPLETED,
        cashStatus: CashStatus.PAID_TO_DRIVER,
        posPaymentMethod: PosPaymentMethod.CASH,
      },
      orderBy: { completedAt: 'asc' },
      select: { id: true, totalPrice: true },
      take: 5000,
    });
    let remaining = amount;
    const settleIds: string[] = [];
    let settledAmount = 0;
    for (const row of pending) {
      const v = Number.parseFloat(row.totalPrice.toString());
      if (!Number.isFinite(v) || v <= 0) continue;
      if (v <= remaining + 0.0001) {
        settleIds.push(row.id);
        settledAmount += v;
        remaining -= v;
      }
      if (remaining <= 0.0001) break;
    }
    if (settleIds.length > 0) {
      await db.order.updateMany({
        where: { id: { in: settleIds }, cashStatus: CashStatus.PAID_TO_DRIVER },
        data: { cashStatus: CashStatus.HANDED_OVER_TO_OFFICE },
      });
    }
    return {
      settledAmountKd: settledAmount.toFixed(4),
      settledOrderCount: settleIds.length,
    };
  }

  /**
   * Receivables / "المديونية" — aggregated per order, open amounts attributed
   * to the issuer (driver / CC / branch manager). Deducts payments incl. FIFO
   * on customer-level CC residuals.
   *
   * V20.4 — when `isJournalAsSourceEnabled()` is on, dispatches to
   * `getUnpaidInvoicesFromJournal` which reads per-order remaining directly from
   * JournalLine (account 1300) via `computeOrderRemainingBalancesBatch`. Orders
   * with no journal entries (pre-backfill) are excluded from the journal path
   * because R3 falls back to DebtLedger for them, but discovery still relies on
   * JournalEntry.source. Pre-backfill data continues to appear via the
   * OPEN_UNPAID_ORDER merge in Phase 5 (unchanged in both paths).
   */
  async getUnpaidInvoices(
    query: UnpaidInvoicesQueryDto,
  ): Promise<UnpaidInvoicesResponseDto> {
    await this.logSuspiciousDebtPayments();
    return this.getUnpaidInvoicesFromJournal(query);
  }


  /**
   * V20.4 — Journal path for `getUnpaidInvoices`.
   *
   * Discovers invoiced orders via `JournalEntry.source IN ['ORDER_INVOICE','INVOICE']`
   * (same createdAt / actorUser / customer filters as the ledger path). Per-order
   * remaining comes from `computeOrderRemainingBalancesBatch` (R3) which already
   * reads JournalLine account 1300 when the flag is on.
   *
   * Simplifications vs the ledger path:
   *   • No FIFO payment-allocation loop — the journal net per order IS the remaining.
   *   • `currentCustomerDebtKd` = batch JournalLine 1300 net for the customer
   *     (whole history, not scoped to the date filter).
   *
   * Phase 5 (OPEN_UNPAID_ORDER merge) and Phase 6 (market KPIs) are structurally
   * identical to the ledger path — they query the Order table directly.
   */
  private async getUnpaidInvoicesFromJournal(
    query: UnpaidInvoicesQueryDto,
  ): Promise<UnpaidInvoicesResponseDto> {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    if (from && Number.isNaN(from.getTime())) {
      throw new BadRequestException('Invalid `from` date');
    }
    if (to && Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid `to` date');
    }
    const phone = (query.customerPhone ?? '').replace(/\D+/g, '').trim();
    const TOLERANCE_KD = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);
    const TOL_N = 0.001;

    // ── Pre-filter A: customer IDs by phone ─────────────────────────────────
    // JournalEntry has customerId but no customer relation, so we pre-resolve.
    let customerIdFilter: string[] | undefined;
    if (phone) {
      const customers = await this.prisma.customer.findMany({
        where: {
          OR: [{ phone: { contains: phone } }, { phone2: { contains: phone } }],
        },
        select: { id: true },
      });
      customerIdFilter = customers.map((c) => c.id);
      // Empty array → JournalEntry query returns zero rows (Prisma IN () = FALSE).
    }

    // ── Pre-filter B: order IDs by branch ────────────────────────────────────
    // JournalEntry.branchId is nullable (pre-V20.5 entries lack it), so branch
    // scoping goes through the Order table — same rule as Phase 5 unlinked rows.
    let branchOrderIdArray: string[] | undefined;
    if (query.branchId?.trim()) {
      const branchOrders = await this.prisma.order.findMany({
        where: { ...(orderBranchWhereForMarketDebt(query.branchId) ?? {}) },
        select: { id: true },
        take: 50_000,
      });
      branchOrderIdArray = branchOrders.map((o) => o.id);
    }

    // ── Phase 1 (journal): discover invoiced orders ──────────────────────────
    // 'ORDER_INVOICE' → V20.3 issuance (DR 1300 = totalPrice)
    // 'INVOICE'       → legacy shortfall/overuse mirror (DR 1300 = shortfall amt)
    const journalWhere: Prisma.JournalEntryWhereInput = {
      source: { in: ['ORDER_INVOICE', 'INVOICE'] },
      orderId: { not: null },
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(customerIdFilter !== undefined
        ? { customerId: { in: customerIdFilter } }
        : {}),
      ...(branchOrderIdArray !== undefined
        ? { orderId: { in: branchOrderIdArray } }
        : {}),
    };

    const rawEntries = await this.prisma.journalEntry.findMany({
      where: journalWhere,
      orderBy: { createdAt: 'desc' },
      take: 20_000,
      select: {
        id: true,
        source: true,
        sourceRef: true,
        orderId: true,
        customerId: true,
        actorUserId: true,
        createdAt: true,
      },
    });

    // De-duplicate by orderId — keep the entry that identifies SUBSCRIPTION_OVERUSE
    // if present; otherwise keep the first (most recent) entry per order.
    const orderIdToEntry = new Map<string, (typeof rawEntries)[0]>();
    for (const e of rawEntries) {
      if (!e.orderId) continue;
      const existing = orderIdToEntry.get(e.orderId);
      if (!existing) {
        orderIdToEntry.set(e.orderId, e);
      } else if ((e.sourceRef ?? '').toUpperCase().includes('SUBSCRIPTION_OVERUSE')) {
        orderIdToEntry.set(e.orderId, e);
      }
    }

    const orderIdsWithJournal = Array.from(orderIdToEntry.keys());

    // ── Phase 2 (journal): per-order remaining via R3 ───────────────────────
    const remainingByOrder =
      orderIdsWithJournal.length > 0
        ? await computeOrderRemainingBalancesBatch(this.prisma, orderIdsWithJournal)
        : new Map<string, Prisma.Decimal>();

    // Filter to open orders (remaining > tolerance).
    const openOrderIds = orderIdsWithJournal.filter((id) => {
      const rem = remainingByOrder.get(id) ?? new Prisma.Decimal(0);
      return rem.greaterThan(TOLERANCE_KD);
    });

    // ── Fetch Order details (serial, customer, driver, branch) ────────────────
    const orderDetails =
      openOrderIds.length > 0
        ? await this.prisma.order.findMany({
            where: { id: { in: openOrderIds } },
            select: {
              id: true,
              serialNumber: true,
              invoiceNumber: true,
              totalPrice: true,
              createdAt: true,
              completedAt: true,
              posPaymentMethod: true,
              customerId: true,
              driverId: true,
              customer: {
                select: {
                  id: true,
                  displayName: true,
                  phone: true,
                  phone2: true,
                  originBranch: { select: { id: true, name: true } },
                },
              },
              driver: {
                select: {
                  id: true,
                  fullName: true,
                  username: true,
                  safariRole: true,
                  branch: { select: { id: true, name: true } },
                },
              },
            },
          })
        : [];
    const orderDetailById = new Map(orderDetails.map((o) => [o.id, o]));

    // ── Fetch actor users (for orders without a driver) ──────────────────────
    const journalActorIds = Array.from(
      new Set(
        openOrderIds
          .map((id) => orderIdToEntry.get(id)?.actorUserId)
          .filter((id): id is string => !!id),
      ),
    );
    const actorUsersForJournal =
      journalActorIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: journalActorIds } },
            select: { id: true, fullName: true, username: true, safariRole: true },
          })
        : [];
    const actorById = new Map(actorUsersForJournal.map((u) => [u.id, u]));

    // ── Phase 3 (journal): batch customer total AR on account 1300 ───────────
    // This is the customer's ENTIRE AR balance (not scoped to the date filter)
    // so it matches what `custOpen` represents in the ledger path.
    const allCustomerIds = Array.from(
      new Set(
        openOrderIds
          .map((id) => orderDetailById.get(id)?.customerId)
          .filter((id): id is string => !!id),
      ),
    );
    const customerTotalAr = new Map<string, Prisma.Decimal>();
    if (allCustomerIds.length > 0) {
      const arLines = await this.prisma.journalLine.findMany({
        where: {
          entry: { customerId: { in: allCustomerIds } },
          account: { code: '1300' },
        },
        select: {
          debit: true,
          credit: true,
          entry: { select: { customerId: true } },
        },
      });
      for (const line of arLines) {
        const cid = (line.entry as { customerId: string | null }).customerId;
        if (!cid) continue;
        const cur = customerTotalAr.get(cid) ?? new Prisma.Decimal(0);
        customerTotalAr.set(
          cid,
          cur
            .add(new Prisma.Decimal(line.debit.toString()))
            .sub(new Prisma.Decimal(line.credit.toString())),
        );
      }
      for (const [cid, net] of customerTotalAr) {
        if (net.lessThan(0)) customerTotalAr.set(cid, new Prisma.Decimal(0));
      }
    }

    const subscriptionStateByCustomer = await getCustomerSubscriptionStateBatch(
      this.prisma,
      allCustomerIds,
    );

    // ── Build rows for journal-discovered invoices ───────────────────────────
    const finalRows: UnpaidInvoiceRowDto[] = [];
    let totalDebt = 0;
    let totalPaid = 0;
    let openDebt = 0;
    let openShortfallDebt = 0;
    let openSubDebt = 0;
    let openUnpaidOrderBalance = 0;
    let totalInvOrderSum = 0;
    const orderInvTallied = new Set<string>();
    let openInvoiceCount = 0;
    const openCustomers = new Set<string>();

    for (const orderId of openOrderIds) {
      const entry = orderIdToEntry.get(orderId);
      if (!entry) continue;
      const o = orderDetailById.get(orderId);
      if (!o) continue;

      const rem = remainingByOrder.get(orderId) ?? new Prisma.Decimal(0);
      const grossDec = new Prisma.Decimal(o.totalPrice.toString());
      const paidDec = Prisma.Decimal.max(
        grossDec.sub(rem),
        new Prisma.Decimal(0),
      );
      const gross = grossDec.toNumber();
      const remaining = rem.toNumber();
      const paid = paidDec.toNumber();
      const custOpen = Prisma.Decimal.max(
        customerTotalAr.get(o.customerId) ?? new Prisma.Decimal(0),
        new Prisma.Decimal(0),
      ).toNumber();

      // SUBSCRIPTION_OVERUSE when sourceRef contains the keyword; else INVOICE_SHORTFALL.
      const debtSource: 'INVOICE_SHORTFALL' | 'SUBSCRIPTION_OVERUSE' = (
        entry.sourceRef ?? ''
      )
        .toUpperCase()
        .includes('SUBSCRIPTION_OVERUSE')
        ? 'SUBSCRIPTION_OVERUSE'
        : 'INVOICE_SHORTFALL';

      // Actor: prefer Order's driver; fall back to journal entry's actorUser.
      const driver = o.driver;
      const journalActor = entry.actorUserId ? actorById.get(entry.actorUserId) : null;
      const actorUserId = driver?.id ?? journalActor?.id ?? null;
      const actorUserName =
        driver?.fullName?.trim() ?? journalActor?.fullName?.trim() ?? null;
      const actorUserRole =
        driver?.safariRole != null
          ? String(driver.safariRole)
          : journalActor?.safariRole != null
            ? String(journalActor.safariRole)
            : null;

      // Branch: prefer driver's branch, then customer origin branch.
      // JournalEntry.branchId is unreliable (nullable), so resolved from Order.
      const branchId =
        driver?.branch?.id ?? o.customer.originBranch?.id ?? null;
      const branchName =
        driver?.branch?.name?.trim() ||
        o.customer.originBranch?.name?.trim() ||
        null;

      let paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
      if (remaining <= TOL_N) paymentStatus = 'PAID';
      else if (paid > TOL_N) paymentStatus = 'PARTIALLY_PAID';
      else paymentStatus = 'UNPAID';

      const issued = (o.completedAt ?? o.createdAt).toISOString();
      const subState = subscriptionStateByCustomer.get(o.customerId);
      const isOpen = remaining > TOL_N;

      const row: UnpaidInvoiceRowDto = {
        orderId: o.id,
        serialNumber: o.serialNumber ?? null,
        invoiceNumber: o.invoiceNumber ?? null,
        issuedAt: issued,
        customerId: o.customerId,
        customerName: o.customer.displayName?.trim() || o.customer.phone || '—',
        customerPhone: o.customer.phone ?? null,
        customerPhone2: o.customer.phone2 ?? null,
        branchId,
        branchName,
        actorUserId,
        actorUserName,
        actorUserRole,
        invoiceTotalKd: o.totalPrice.toString(),
        debtAmountKd: gross.toFixed(4),
        paidKd: paid.toFixed(4),
        remainingKd: remaining.toFixed(4),
        customerRunningRemainingKd: '0',
        entryCount: 1,
        currentCustomerDebtKd: custOpen.toFixed(4),
        isOpen,
        lastEntryAt: entry.createdAt.toISOString(),
        debtSource,
        posPaymentMethod: o.posPaymentMethod ? String(o.posPaymentMethod) : null,
        paymentStatus,
        isPartiallyPaid: paymentStatus === 'PARTIALLY_PAID',
        isFullyPaid: paymentStatus === 'PAID',
        hasActiveSubscription: subState?.isActiveSubscriber ?? false,
        subscriptionExpiresAt: subState?.subscriptionExpiresAtIso ?? null,
      };

      totalDebt += gross;
      totalPaid += paid;
      if (isOpen) {
        openDebt += remaining;
        openInvoiceCount += 1;
        openCustomers.add(o.customerId);
        if (debtSource === 'INVOICE_SHORTFALL') openShortfallDebt += remaining;
        else openSubDebt += remaining;
      }
      if (!orderInvTallied.has(o.id)) {
        totalInvOrderSum += gross;
        orderInvTallied.add(o.id);
      }
      finalRows.push(row);
    }

    // ── Phase 5: merge OPEN_UNPAID_ORDER rows (identical to ledger path) ─────
    const orderIdsCovered = new Set(finalRows.map((r) => r.orderId));
    const listScope =
      query.branchId?.trim() || query.marketKpiBranchId?.trim() || null;
    const orderDateWhere: Prisma.OrderWhereInput | undefined =
      from || to
        ? {
            OR: [
              {
                completedAt: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {}),
                },
              },
              {
                AND: [
                  { completedAt: null },
                  {
                    createdAt: {
                      ...(from ? { gte: from } : {}),
                      ...(to ? { lte: to } : {}),
                    },
                  },
                ],
              },
            ],
          }
        : undefined;
    const phoneWhere: Prisma.OrderWhereInput | undefined = phone
      ? {
          customer: {
            OR: [
              { phone: { contains: phone } },
              { phone2: { contains: phone } },
            ],
          },
        }
      : undefined;
    const baseOrderUnpaid: Prisma.OrderWhereInput = {
      cashStatus: CashStatus.UNPAID,
      status: { not: OrderStatus.CANCELED },
      ...(orderBranchWhereForMarketDebt(listScope ?? undefined) ?? {}),
      ...(orderDateWhere ?? {}),
      ...(phoneWhere ?? {}),
    };
    if (orderIdsCovered.size > 0) {
      (baseOrderUnpaid as { id?: { notIn: string[] } }).id = {
        notIn: Array.from(orderIdsCovered),
      };
    }
    if (query.actorUserId) {
      const actor = await this.prisma.user.findUnique({
        where: { id: query.actorUserId },
        select: { safariRole: true },
      });
      if (actor?.safariRole === SafariRole.DRIVER) {
        (baseOrderUnpaid as { driverId: string }).driverId = query.actorUserId;
      }
    }
    const unlinkedUnpaid = await this.prisma.order.findMany({
      where: baseOrderUnpaid,
      take: 5_000,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        totalPrice: true,
        createdAt: true,
        completedAt: true,
        serialNumber: true,
        invoiceNumber: true,
        posPaymentMethod: true,
        customerId: true,
        driverId: true,
        customer: {
          select: {
            id: true,
            displayName: true,
            phone: true,
            phone2: true,
            originBranch: { select: { id: true, name: true } },
          },
        },
        driver: {
          select: {
            id: true,
            fullName: true,
            username: true,
            safariRole: true,
            branch: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (unlinkedUnpaid.length > 0) {
      // Extend customerTotalAr to cover new customers from unlinked orders.
      const newCustIds = Array.from(
        new Set(
          unlinkedUnpaid
            .map((o) => o.customerId)
            .filter((cid) => !customerTotalAr.has(cid)),
        ),
      );
      if (newCustIds.length > 0) {
        const extraArLines = await this.prisma.journalLine.findMany({
          where: {
            entry: { customerId: { in: newCustIds } },
            account: { code: '1300' },
          },
          select: {
            debit: true,
            credit: true,
            entry: { select: { customerId: true } },
          },
        });
        for (const line of extraArLines) {
          const cid = (line.entry as { customerId: string | null }).customerId;
          if (!cid) continue;
          const cur = customerTotalAr.get(cid) ?? new Prisma.Decimal(0);
          customerTotalAr.set(
            cid,
            cur
              .add(new Prisma.Decimal(line.debit.toString()))
              .sub(new Prisma.Decimal(line.credit.toString())),
          );
        }
        for (const cid of newCustIds) {
          const net = customerTotalAr.get(cid) ?? new Prisma.Decimal(0);
          if (net.lessThan(0)) customerTotalAr.set(cid, new Prisma.Decimal(0));
        }
      }

      // Settlement actor for orders without a driver.
      const ordersWithoutDriver = unlinkedUnpaid
        .filter((o) => !o.driverId)
        .map((o) => o.id);
      const issuerFromSettlement = new Map<
        string,
        { id: string; fullName: string | null; safariRole: SafariRole | null }
      >();
      if (ordersWithoutDriver.length > 0) {
        const settlements = await this.prisma.transactionHistory.findMany({
          where: {
            orderId: { in: ordersWithoutDriver },
            type: LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
            performedById: { not: null },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            orderId: true,
            performedBy: {
              select: { id: true, fullName: true, safariRole: true },
            },
          },
        });
        for (const h of settlements) {
          if (!h.orderId || !h.performedBy) continue;
          if (!issuerFromSettlement.has(h.orderId)) {
            issuerFromSettlement.set(h.orderId, h.performedBy);
          }
        }
      }

      // Extend subscription state to cover unlinked-order customers.
      const extraSubCustIds = Array.from(
        new Set(
          unlinkedUnpaid
            .map((o) => o.customerId)
            .filter((id) => !subscriptionStateByCustomer.has(id)),
        ),
      );
      if (extraSubCustIds.length > 0) {
        const extraStates = await getCustomerSubscriptionStateBatch(
          this.prisma,
          extraSubCustIds,
        );
        for (const [k, v] of extraStates) subscriptionStateByCustomer.set(k, v);
      }

      for (const o of unlinkedUnpaid) {
        const tot = Number.parseFloat(o.totalPrice.toString());
        if (!Number.isFinite(tot) || tot <= 0) continue;
        const branchName =
          o.driver?.branch?.name?.trim() ||
          o.customer.originBranch?.name?.trim() ||
          null;
        const branchId =
          o.driver?.branch?.id?.trim() ?? o.customer.originBranch?.id ?? null;
        const settlementActor = issuerFromSettlement.get(o.id);
        const actorUserId = o.driver?.id ?? settlementActor?.id ?? null;
        const actorUserName =
          o.driver?.fullName?.trim() ?? settlementActor?.fullName?.trim() ?? null;
        const actorUserRole =
          o.driver?.safariRole != null
            ? String(o.driver.safariRole)
            : settlementActor?.safariRole != null
              ? String(settlementActor.safariRole)
              : null;
        const issued = (o.completedAt ?? o.createdAt).toISOString();
        const custOpen = Prisma.Decimal.max(
          customerTotalAr.get(o.customerId) ?? new Prisma.Decimal(0),
          new Prisma.Decimal(0),
        ).toNumber();
        const subState = subscriptionStateByCustomer.get(o.customerId);
        const row: UnpaidInvoiceRowDto = {
          orderId: o.id,
          serialNumber: o.serialNumber ?? null,
          invoiceNumber: o.invoiceNumber ?? null,
          issuedAt: issued,
          customerId: o.customerId,
          customerName: o.customer.displayName?.trim() || o.customer.phone,
          customerPhone: o.customer.phone,
          customerPhone2: o.customer.phone2 ?? null,
          branchId,
          branchName,
          actorUserId,
          actorUserName,
          actorUserRole,
          invoiceTotalKd: o.totalPrice.toString(),
          debtAmountKd: tot.toFixed(4),
          paidKd: '0.0000',
          remainingKd: tot.toFixed(4),
          customerRunningRemainingKd: '0',
          entryCount: 0,
          currentCustomerDebtKd: custOpen.toFixed(4),
          isOpen: true,
          lastEntryAt: issued,
          debtSource: 'OPEN_UNPAID_ORDER',
          posPaymentMethod: o.posPaymentMethod ? String(o.posPaymentMethod) : null,
          paymentStatus: 'UNPAID',
          isPartiallyPaid: false,
          isFullyPaid: false,
          hasActiveSubscription: subState?.isActiveSubscriber ?? false,
          subscriptionExpiresAt: subState?.subscriptionExpiresAtIso ?? null,
        };
        finalRows.push(row);
        totalDebt += tot;
        totalInvOrderSum += tot;
        orderInvTallied.add(o.id);
        openDebt += tot;
        openUnpaidOrderBalance += tot;
        openInvoiceCount += 1;
        openCustomers.add(o.customerId);
      }
    }

    // ── Sort (identical to ledger path) ─────────────────────────────────────
    const debtSourceSortRank = (s: UnpaidInvoiceRowDto['debtSource']) => {
      if (s === 'INVOICE_SHORTFALL') return 0;
      if (s === 'SUBSCRIPTION_OVERUSE') return 1;
      return 2;
    };
    finalRows.sort((a, b) => {
      if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
      const tb = new Date(b.issuedAt).getTime();
      const ta = new Date(a.issuedAt).getTime();
      if (tb !== ta) return tb - ta;
      if (a.orderId !== b.orderId) return a.orderId.localeCompare(b.orderId);
      if (a.debtSource === b.debtSource) return 0;
      return debtSourceSortRank(a.debtSource) - debtSourceSortRank(b.debtSource);
    });

    const withRunningRemaining = attachCanonicalRunningRemaining(finalRows);
    const invoiceCount = withRunningRemaining.length;
    const customerCount = new Set(
      withRunningRemaining.map((r) => r.customerId),
    ).size;
    const avgDebtPerInvoice = invoiceCount > 0 ? totalDebt / invoiceCount : 0;

    // ── Phase 6: market KPIs (identical — queries Order table) ───────────────
    const marketKpiScope =
      query.marketKpiBranchId?.trim() || query.branchId?.trim() || null;
    const marketBaseWhere: Prisma.OrderWhereInput = {
      cashStatus: CashStatus.UNPAID,
      status: { not: OrderStatus.CANCELED },
      ...(orderBranchWhereForMarketDebt(marketKpiScope ?? undefined) ?? {}),
    };
    const [marketAgg, byMethod] = await Promise.all([
      this.prisma.order.aggregate({
        where: marketBaseWhere,
        _sum: { totalPrice: true },
      }),
      this.prisma.order.groupBy({
        by: ['posPaymentMethod'],
        where: marketBaseWhere,
        _sum: { totalPrice: true },
      }),
    ]);
    const totalMarketUnpaidKd = (
      marketAgg._sum.totalPrice ?? new Prisma.Decimal(0)
    ).toFixed(4);
    const marketUnpaidByMethod = foldMarketUnpaidByMethod(byMethod);

    return {
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
      kpis: {
        invoiceCount,
        openInvoiceCount,
        customerCount,
        openCustomerCount: openCustomers.size,
        totalInvoicesKd: totalInvOrderSum.toFixed(4),
        totalDebtKd: totalDebt.toFixed(4),
        totalPaidKd: totalPaid.toFixed(4),
        openDebtKd: openDebt.toFixed(4),
        openShortfallDebtKd: openShortfallDebt.toFixed(4),
        openSubscriptionOveruseDebtKd: openSubDebt.toFixed(4),
        openUnpaidOrderBalanceKd: openUnpaidOrderBalance.toFixed(4),
        totalMarketUnpaidKd,
        marketUnpaidByMethod,
        avgDebtPerInvoiceKd: avgDebtPerInvoice.toFixed(4),
      },
      rows: withRunningRemaining,
    };
  }

  private async logSuspiciousDebtPayments(): Promise<void> {
    return;
  }

  /**
   * Net open debt split (shortfall vs subscription overuse) using the same
   * per-customer waterfall as monthly reports — scoped for CC dashboard KPIs.
   */
  /**
   * Per-customer net open amounts from {@link DebtLedgerEntry}: same PAYMENT→
   * INVOICE_SHORTFALL→SUBSCRIPTION_OVERUSE waterfall as {@link getLedgerOpenDebtByCategory}.
   * This is what Ops «ذمم دفتر الالتزام» / financial strip sums to globally.
   */
  async getCustomerNetDebtFromDebtLedger(
    customerId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{
    outstandingInvoiceDebtKd: Prisma.Decimal;
    outstandingSubscriptionDebtKd: Prisma.Decimal;
    netOpenDebtKd: Prisma.Decimal;
  }> {
    const db = tx ?? this.prisma;
    return getCustomerNetDebtFromDebtLedgerAgg(db, customerId);
  }

  async getLedgerOpenDebtByCategory(
    _whereExtra?: Record<string, unknown>,
  ): Promise<{
    outstandingInvoiceDebtKd: string;
    outstandingSubscriptionDebtKd: string;
  }> {
    return {
      outstandingInvoiceDebtKd: '0.0000',
      outstandingSubscriptionDebtKd: '0.0000',
    };
  }

  /**
   * V19.11.4 — NET open debt, grouped by the invoice's original issuer
   * (DRIVER / BRANCH / OTHER). Exec dashboard "توزيع الديون" — every
   * INVOICE_SHORTFALL role is in one bucket. `getUnpaidInvoices().kpis.openDebtKd`
   * uses the same per-order FIFO; the market red KPI is
   * `getUnpaidInvoices().kpis.totalMarketUnpaidKd`.
   */
  async getOpenDebtByIssuer(
    _branchId?: string,
  ): Promise<OpenDebtByIssuerResponseDto> {
    return {
      rows: [
        { issuer: 'DRIVER', openDebtKd: '0.0000', openInvoiceCount: 0, openCustomerCount: 0 },
        { issuer: 'BRANCH', openDebtKd: '0.0000', openInvoiceCount: 0, openCustomerCount: 0 },
        { issuer: 'OTHER', openDebtKd: '0.0000', openInvoiceCount: 0, openCustomerCount: 0 },
      ],
      totalOpenDebtKd: '0.0000',
      openInvoiceCount: 0,
      openCustomerCount: 0,
      computedAt: new Date().toISOString(),
    };
  }
}

