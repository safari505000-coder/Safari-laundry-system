import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CashStatus,
  DebtEntityCategory,
  DebtSource,
  LedgerTransactionType,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
  SafariRole,
} from '@prisma/client';
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
    const debtRows = await this.prisma.debtLedgerEntry.groupBy({
      by: ['source', 'category'],
      _sum: { amount: true },
    });
    let debtFromIssuedInvoices = 0;
    let debtFromSubscriptionOveruse = 0;
    let debtByBranch = 0;
    let debtByDriver = 0;
    let debtByOwner = 0;
    let debtByCallCenter = 0;
    for (const row of debtRows) {
      const amount = Number.parseFloat(row._sum.amount?.toString() ?? '0');
      if (!Number.isFinite(amount) || amount <= 0) continue;
      if (row.source === DebtSource.INVOICE_SHORTFALL) debtFromIssuedInvoices += amount;
      else if (row.source === DebtSource.SUBSCRIPTION_OVERUSE) {
        debtFromSubscriptionOveruse += amount;
      }
      if (row.category === DebtEntityCategory.BRANCH) debtByBranch += amount;
      else if (row.category === DebtEntityCategory.DRIVER) debtByDriver += amount;
      else if (row.category === DebtEntityCategory.OWNER) debtByOwner += amount;
      else if (row.category === DebtEntityCategory.CALL_CENTER) debtByCallCenter += amount;
    }
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
    category?: DebtEntityCategory,
    branchId?: string,
    actorUserId?: string,
  ) {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid date range');
    }
    const where: Prisma.DebtLedgerEntryWhereInput = {
      createdAt: { gte: from, lte: to },
      ...(category ? { category } : {}),
      ...(branchId ? { branchId } : {}),
      ...(actorUserId ? { actorUserId } : {}),
    };
    const rows = await this.prisma.debtLedgerEntry.groupBy({
      by: ['category', 'source'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      rows: rows.map((r) => ({
        category: r.category,
        source: r.source,
        entryCount: r._count._all,
        totalDebt: r._sum.amount?.toString() ?? '0',
      })),
    };
  }

  async getTotalDebt(): Promise<string> {
    const s = await this.getOwnerCustomerWalletSummary();
    return s.totalCustomerDebts;
  }

  async getCustomerDebtSnapshot(customerId: string): Promise<{
    walletDebt: string;
    subscriptionOveruseDebt: string;
    totalDebt: string;
  }> {
    const wallet = await this.prisma.customerWallet.findUnique({
      where: { customerId },
      select: { balance: true, debt: true },
    });
    const walletDebt = Number.parseFloat(wallet?.debt?.toString?.() ?? '0');
    const balance = Number.parseFloat(wallet?.balance?.toString?.() ?? '0');
    const subscriptionOveruseDebt =
      Number.isFinite(balance) && balance < 0 ? Math.abs(balance) : 0;
    const totalDebt = (Number.isFinite(walletDebt) ? walletDebt : 0) + subscriptionOveruseDebt;
    return {
      walletDebt: (Number.isFinite(walletDebt) ? walletDebt : 0).toFixed(4),
      subscriptionOveruseDebt: subscriptionOveruseDebt.toFixed(4),
      totalDebt: totalDebt.toFixed(4),
    };
  }

  /**
   * Settles driver cash liability by moving completed CASH orders
   * from PAID_TO_DRIVER -> HANDED_OVER_TO_OFFICE up to approved amount.
   */
  async applyDriverDepositSettlement(
    driverId: string,
    approvedAmountKd: number,
  ): Promise<{ settledAmountKd: string; settledOrderCount: number }> {
    const amount = Number.isFinite(approvedAmountKd) && approvedAmountKd > 0 ? approvedAmountKd : 0;
    if (amount <= 0) {
      return { settledAmountKd: '0.0000', settledOrderCount: 0 };
    }
    const pending = await this.prisma.order.findMany({
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
      await this.prisma.order.updateMany({
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
   * Receivables / "المديونية" — all `INVOICE_SHORTFALL` / `SUBSCRIPTION_OVERUSE`
   * lines with `orderId` (any actor), aggregated per order. Each open amount is
   * owed by the customer and attributed to `actorUser*` (who issued / settled
   * the ticket — driver, branch manager, call center, etc.). `remaining` deducts
   * recorded `PAYMENT` (incl. FIFO on customer-level payments). Subscription
   * overage uses the same customer-level FIFO as the monthly P&amp;L split.
   */
  async getUnpaidInvoices(
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

    // INVOICE_SHORTFALL and SUBSCRIPTION_OVERUSE for every order-attributed line
    // (field POS, subscription wallet, or admin flows such as invoice edit).
    // Do not filter on `actorUser` role: «متابعة السائق» and driver lists must
    // stay in lock-step with this table; a null actor or a CC edit must still
    // surface the receivable.
    const where: Prisma.DebtLedgerEntryWhereInput = {
      source: { in: [DebtSource.INVOICE_SHORTFALL, DebtSource.SUBSCRIPTION_OVERUSE] },
      orderId: { not: null },
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(phone
        ? {
            customer: {
              OR: [{ phone: { contains: phone } }, { phone2: { contains: phone } }],
            },
          }
        : {}),
    };

    const entries = await this.prisma.debtLedgerEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 20_000,
      select: {
        id: true,
        source: true,
        amount: true,
        createdAt: true,
        orderId: true,
        customerId: true,
        branchId: true,
        actorUserId: true,
        customer: {
          select: {
            id: true,
            displayName: true,
            phone: true,
            phone2: true,
          },
        },
        branch: {
          select: { id: true, name: true },
        },
        actorUser: {
          select: {
            id: true,
            fullName: true,
            username: true,
            safariRole: true,
          },
        },
        order: {
          select: {
            id: true,
            serialNumber: true,
            invoiceNumber: true,
            totalPrice: true,
            createdAt: true,
            completedAt: true,
          },
        },
      },
    });

    type OrderAgg = {
      row: UnpaidInvoiceRowDto;
      shortSum: number;
      subSum: number;
      lastEntryShort: string;
      lastEntrySub: string;
      entryCountShort: number;
      entryCountSub: number;
    };

    const byOrder = new Map<string, OrderAgg>();

    for (const e of entries) {
      if (!e.orderId || !e.order) continue;
      const amount = Number.parseFloat(e.amount.toString());
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const tIso = e.createdAt.toISOString();
      const isShort = e.source === DebtSource.INVOICE_SHORTFALL;

      const ex = byOrder.get(e.orderId);
      if (ex) {
        if (isShort) {
          ex.shortSum += amount;
          ex.entryCountShort += 1;
          if (tIso > ex.lastEntryShort) ex.lastEntryShort = tIso;
        } else {
          ex.subSum += amount;
          ex.entryCountSub += 1;
          if (tIso > ex.lastEntrySub) ex.lastEntrySub = tIso;
        }
        continue;
      }

      const actorRole =
        e.actorUser?.safariRole != null
          ? String(e.actorUser.safariRole)
          : null;

      const baseRow: UnpaidInvoiceRowDto = {
        orderId: e.order.id,
        serialNumber: e.order.serialNumber ?? null,
        invoiceNumber: e.order.invoiceNumber ?? null,
        issuedAt: (e.order.completedAt ?? e.order.createdAt).toISOString(),
        customerId: e.customer.id,
        customerName: e.customer.displayName ?? e.customer.phone ?? '—',
        customerPhone: e.customer.phone ?? null,
        customerPhone2: e.customer.phone2 ?? null,
        branchId: e.branch?.id ?? null,
        branchName: e.branch?.name ?? null,
        actorUserId: e.actorUser?.id ?? null,
        actorUserName: e.actorUser?.fullName ?? null,
        actorUserRole: actorRole,
        invoiceTotalKd: e.order.totalPrice.toString(),
        debtAmountKd: '0',
        paidKd: '0',
        remainingKd: '0',
        entryCount: 1,
        currentCustomerDebtKd: '0',
        isOpen: true,
        lastEntryAt: tIso,
        debtSource: 'INVOICE_SHORTFALL',
      };

      byOrder.set(e.orderId, {
        shortSum: isShort ? amount : 0,
        subSum: isShort ? 0 : amount,
        lastEntryShort: isShort ? tIso : '',
        lastEntrySub: isShort ? '' : tIso,
        entryCountShort: isShort ? 1 : 0,
        entryCountSub: isShort ? 0 : 1,
        row: baseRow,
      });
    }

    const orderIds = Array.from(byOrder.keys());
    const customerIds = Array.from(
      new Set(Array.from(byOrder.values()).map((x) => x.row.customerId)),
    );

    const [paymentsByOrder, customerLedgerTotals] = await Promise.all([
      orderIds.length
        ? this.prisma.debtLedgerEntry.groupBy({
            by: ['orderId'],
            where: {
              source: DebtSource.PAYMENT,
              orderId: { in: orderIds },
            },
            _sum: { amount: true },
          })
        : Promise.resolve([]),
      customerIds.length
        ? this.prisma.debtLedgerEntry.groupBy({
            by: ['customerId', 'source'],
            where: { customerId: { in: customerIds } },
            _sum: { amount: true },
          })
        : Promise.resolve([]),
    ]);

    const paidByOrder = new Map<string, number>();
    for (const g of paymentsByOrder) {
      if (!g.orderId) continue;
      const paid = Number.parseFloat(g._sum.amount?.toString() ?? '0');
      paidByOrder.set(g.orderId, Number.isFinite(paid) ? paid : 0);
    }

    type CustomerTotals = { debt: number; payment: number };
    const perCustomer = new Map<string, CustomerTotals>();
    for (const g of customerLedgerTotals) {
      const cur = perCustomer.get(g.customerId) ?? { debt: 0, payment: 0 };
      const v = Number.parseFloat(g._sum.amount?.toString() ?? '0');
      if (!Number.isFinite(v)) continue;
      if (g.source === DebtSource.PAYMENT) cur.payment += v;
      else cur.debt += v;
      perCustomer.set(g.customerId, cur);
    }

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

    for (const cid of customerIds) {
      const custAggs = Array.from(byOrder.values()).filter(
        (a) => a.row.customerId === cid,
      );
      custAggs.sort(
        (a, b) =>
          new Date(a.row.issuedAt).getTime() -
          new Date(b.row.issuedAt).getTime(),
      );

      type Q = {
        agg: OrderAgg;
        sNet: number;
        tNet: number;
        directShort: number;
        directSub: number;
        grossS: number;
        grossT: number;
        issuedAt: string;
      };
      const shortQ: Q[] = [];
      const subQ: Q[] = [];

      for (const agg of custAggs) {
        const payO = paidByOrder.get(agg.row.orderId) ?? 0;
        const S = agg.shortSum;
        const T = agg.subSum;
        const dS = Math.min(payO, S);
        const sNet = Math.max(0, S - dS);
        const remPay = payO - dS;
        const dT = Math.min(Math.max(0, remPay), T);
        const tNet = Math.max(0, T - dT);
        const issued = agg.row.issuedAt;
        if (S > 0) {
          shortQ.push({
            agg,
            sNet,
            tNet,
            directShort: dS,
            directSub: dT,
            grossS: S,
            grossT: T,
            issuedAt: issued,
          });
        }
        if (T > 0) {
          subQ.push({
            agg,
            sNet,
            tNet,
            directShort: dS,
            directSub: dT,
            grossS: S,
            grossT: T,
            issuedAt: issued,
          });
        }
      }

      shortQ.sort(
        (a, b) =>
          new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime(),
      );
      subQ.sort(
        (a, b) =>
          new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime(),
      );

      const custTotals = perCustomer.get(cid) ?? { debt: 0, payment: 0 };
      const custOpen = Math.max(custTotals.debt - custTotals.payment, 0);
      let rem = custOpen;

      const pushRow = (
        x: Q,
        kind: 'INVOICE_SHORTFALL' | 'SUBSCRIPTION_OVERUSE',
        perOrderNet: number,
        directPart: number,
        gross: number,
        lastAt: string,
        entryCount: number,
      ) => {
        const share = Math.min(perOrderNet, rem);
        rem -= share;
        const fifo = perOrderNet - share;
        const invoicePaid = directPart + fifo;
        const remaining = share;
        const invTotal = Number.parseFloat(x.agg.row.invoiceTotalKd);
        if (Number.isFinite(invTotal) && !orderInvTallied.has(x.agg.row.orderId)) {
          totalInvOrderSum += invTotal;
          orderInvTallied.add(x.agg.row.orderId);
        }
        const isOpen = remaining > 0.0001;
        const r: UnpaidInvoiceRowDto = {
          ...x.agg.row,
          debtSource: kind,
          debtAmountKd: gross.toFixed(4),
          paidKd: invoicePaid.toFixed(4),
          remainingKd: remaining.toFixed(4),
          currentCustomerDebtKd: custOpen.toFixed(4),
          isOpen,
          entryCount,
          lastEntryAt: lastAt || x.agg.row.issuedAt,
        };
        totalDebt += gross;
        totalPaid += invoicePaid;
        if (isOpen) {
          openDebt += remaining;
          openInvoiceCount += 1;
          openCustomers.add(x.agg.row.customerId);
          if (kind === 'INVOICE_SHORTFALL') openShortfallDebt += remaining;
          else openSubDebt += remaining;
        }
        finalRows.push(r);
      };

      for (const x of shortQ) {
        pushRow(
          x,
          'INVOICE_SHORTFALL',
          x.sNet,
          x.directShort,
          x.grossS,
          x.agg.lastEntryShort,
          x.agg.entryCountShort,
        );
      }
      for (const x of subQ) {
        pushRow(
          x,
          'SUBSCRIPTION_OVERUSE',
          x.tNet,
          x.directSub,
          x.grossT,
          x.agg.lastEntrySub,
          x.agg.entryCountSub,
        );
      }
    }

    // ── Merge UNPAITotal orders (same scope as the red market KPI) that have
    //    no field-ledger row yet, so the table is never empty while the
    //    top card still shows «الديون السوقية». Disappear when the order is
    //    no longer `UNPAITotal` (collected) — the row is dropped on the next
    //    fetch. See `orderBranchWhereForMarketDebt` for branch semantics.
    const orderIdsCovered = new Set(finalRows.map((r) => r.orderId));
    const listScope = query.branchId?.trim() || query.marketKpiBranchId?.trim() || null;
    const orderDateWhere: Prisma.OrderWhereInput | undefined = from || to
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
            OR: [{ phone: { contains: phone } }, { phone2: { contains: phone } }],
          },
        }
      : undefined;
    const baseOrderUnpaid: Prisma.OrderWhereInput = {
      cashStatus: CashStatus.UNPAID,
      status: { not: OrderStatus.CANCELED },
      ...(orderBranchWhereForMarketDebt(listScope ?? undefined) ?? {}),
      ...(orderDateWhere ? orderDateWhere : {}),
      ...(phoneWhere ? phoneWhere : {}),
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
      const needCust = Array.from(
        new Set(
          unlinkedUnpaid
            .map((o) => o.customerId)
            .filter((cid) => !perCustomer.has(cid)),
        ),
      );
      if (needCust.length) {
        const moreTotals = await this.prisma.debtLedgerEntry.groupBy({
          by: ['customerId', 'source'],
          where: { customerId: { in: needCust } },
          _sum: { amount: true },
        });
        for (const g of moreTotals) {
          const cur = perCustomer.get(g.customerId) ?? { debt: 0, payment: 0 };
          const v = Number.parseFloat(g._sum.amount?.toString() ?? '0');
          if (!Number.isFinite(v)) continue;
          if (g.source === DebtSource.PAYMENT) cur.payment += v;
          else cur.debt += v;
          perCustomer.set(g.customerId, cur);
        }
      }
    }

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

    for (const o of unlinkedUnpaid) {
      const tot = Number.parseFloat(o.totalPrice.toString());
      if (!Number.isFinite(tot) || tot <= 0) continue;
      const branchName =
        o.driver?.branch?.name?.trim() || o.customer.originBranch?.name?.trim() || null;
      const branchId = o.driver?.branch?.id?.trim() ?? o.customer.originBranch?.id ?? null;
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
      const ct = perCustomer.get(o.customerId) ?? { debt: 0, payment: 0 };
      const custOpen = Math.max(ct.debt - ct.payment, 0);
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
        entryCount: 0,
        currentCustomerDebtKd: custOpen.toFixed(4),
        isOpen: true,
        lastEntryAt: issued,
        debtSource: 'OPEN_UNPAID_ORDER',
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

    const debtSourceSortRank = (s: UnpaidInvoiceRowDto['debtSource']) => {
      if (s === 'INVOICE_SHORTFALL') return 0;
      if (s === 'SUBSCRIPTION_OVERUSE') return 1;
      return 2; // OPEN_UNPAID_ORDER
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

    const invoiceCount = finalRows.length;
    const customerCount = new Set(finalRows.map((r) => r.customerId)).size;
    const avgDebtPerInvoice =
      invoiceCount > 0 ? totalDebt / invoiceCount : 0;

    // Headline KPI: same Σ `Order.totalPrice` as the red "إجمالي الديون السوقية"
    // on `/collections` / call-center ops (UNPAID + branch OR), until the order
    // leaves UNPAID — no short-horizon date window. When the table is unscoped
    // (`!branchId`) but the UI passes `marketKpiBranchId`, match the branch the
    // owner/manager context uses for operations-summary; otherwise all branches.
    const marketKpiScope =
      query.marketKpiBranchId?.trim() || query.branchId?.trim() || null;
    const marketBaseWhere: Prisma.OrderWhereInput = {
      cashStatus: CashStatus.UNPAID,
      status: { not: OrderStatus.CANCELED },
      ...(orderBranchWhereForMarketDebt(marketKpiScope ?? undefined) ?? {}),
    };
    // `marketUnpaidByMethod`: same UNPAID order universe as the red KPI, split by
    // `posPaymentMethod`. Every uncollected field total is receivable on the
    // customer and attributed to whoever issued/settled the ticket (see table
    // «المُصدِّر»); do not restrict to DRIVER/MANAGER shortfall rows only.
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
      rows: finalRows,
    };
  }

  /**
   * Net open debt split (shortfall vs subscription overuse) using the same
   * per-customer waterfall as monthly reports — scoped for CC dashboard KPIs.
   */
  async getLedgerOpenDebtByCategory(
    whereExtra?: Prisma.DebtLedgerEntryWhereInput,
  ): Promise<{
    outstandingInvoiceDebtKd: string;
    outstandingSubscriptionDebtKd: string;
  }> {
    const z = new Prisma.Decimal(0);
    const rows = await this.prisma.debtLedgerEntry.groupBy({
      by: ['customerId', 'source'],
      where: whereExtra ?? {},
      _sum: { amount: true },
    });
    type Bucket = { inv: Prisma.Decimal; sub: Prisma.Decimal; pay: Prisma.Decimal };
    const byCustomer = new Map<string, Bucket>();
    for (const r of rows) {
      const amt = new Prisma.Decimal(r._sum.amount?.toString() ?? '0');
      const cur = byCustomer.get(r.customerId) ?? {
        inv: new Prisma.Decimal(0),
        sub: new Prisma.Decimal(0),
        pay: new Prisma.Decimal(0),
      };
      if (r.source === DebtSource.INVOICE_SHORTFALL) cur.inv = cur.inv.add(amt);
      else if (r.source === DebtSource.SUBSCRIPTION_OVERUSE) cur.sub = cur.sub.add(amt);
      else if (r.source === DebtSource.PAYMENT) cur.pay = cur.pay.add(amt);
      byCustomer.set(r.customerId, cur);
    }
    let openInv = z;
    let openSub = z;
    for (const { inv, sub, pay } of byCustomer.values()) {
      const invPaid = inv.lessThanOrEqualTo(pay) ? inv : pay;
      const payAfterInv = pay.sub(invPaid);
      const subPaid = sub.lessThanOrEqualTo(payAfterInv) ? sub : payAfterInv;
      const remInv = inv.sub(invPaid);
      const remSub = sub.sub(subPaid);
      if (remInv.gt(0)) openInv = openInv.add(remInv);
      if (remSub.gt(0)) openSub = openSub.add(remSub);
    }
    return {
      outstandingInvoiceDebtKd: openInv.toFixed(4),
      outstandingSubscriptionDebtKd: openSub.toFixed(4),
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
    branchId?: string,
  ): Promise<OpenDebtByIssuerResponseDto> {
    const where: Prisma.DebtLedgerEntryWhereInput = {
      source: DebtSource.INVOICE_SHORTFALL,
      orderId: { not: null },
      ...(branchId ? { branchId } : {}),
    };

    const entries = await this.prisma.debtLedgerEntry.findMany({
      where,
      select: {
        orderId: true,
        customerId: true,
        amount: true,
        createdAt: true,
        actorUser: { select: { safariRole: true } },
      },
      take: 20_000,
    });

    type O = {
      orderId: string;
      customerId: string;
      debt: number;
      createdAt: Date;
      issuerRole: SafariRole | null;
    };
    const byOrder = new Map<string, O>();
    for (const e of entries) {
      if (!e.orderId) continue;
      const amt = Number.parseFloat(e.amount.toString());
      if (!Number.isFinite(amt) || amt <= 0) continue;
      const existing = byOrder.get(e.orderId);
      if (existing) {
        existing.debt += amt;
        continue;
      }
      byOrder.set(e.orderId, {
        orderId: e.orderId,
        customerId: e.customerId,
        debt: amt,
        createdAt: e.createdAt,
        issuerRole: e.actorUser?.safariRole ?? null,
      });
    }

    const orders = Array.from(byOrder.values());
    if (orders.length === 0) {
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

    const customerIds = Array.from(new Set(orders.map((o) => o.customerId)));
    const [paymentsByOrder, perCustomerTotals] = await Promise.all([
      this.prisma.debtLedgerEntry.groupBy({
        by: ['orderId'],
        where: {
          source: DebtSource.PAYMENT,
          orderId: { in: orders.map((o) => o.orderId) },
        },
        _sum: { amount: true },
      }),
      this.prisma.debtLedgerEntry.groupBy({
        by: ['customerId', 'source'],
        where: { customerId: { in: customerIds } },
        _sum: { amount: true },
      }),
    ]);

    const paidByOrder = new Map<string, number>();
    for (const g of paymentsByOrder) {
      if (!g.orderId) continue;
      paidByOrder.set(
        g.orderId,
        Number.parseFloat(g._sum.amount?.toString() ?? '0'),
      );
    }

    const perCustomer = new Map<string, { debt: number; payment: number }>();
    for (const g of perCustomerTotals) {
      const cur = perCustomer.get(g.customerId) ?? { debt: 0, payment: 0 };
      const v = Number.parseFloat(g._sum.amount?.toString() ?? '0');
      if (!Number.isFinite(v)) continue;
      if (g.source === DebtSource.PAYMENT) cur.payment += v;
      else cur.debt += v;
      perCustomer.set(g.customerId, cur);
    }

    const ordersByCustomer = new Map<string, O[]>();
    for (const o of orders) {
      const arr = ordersByCustomer.get(o.customerId) ?? [];
      arr.push(o);
      ordersByCustomer.set(o.customerId, arr);
    }

    const buckets: Record<
      'DRIVER' | 'BRANCH' | 'OTHER',
      { open: number; invoices: number; customers: Set<string> }
    > = {
      DRIVER: { open: 0, invoices: 0, customers: new Set() },
      BRANCH: { open: 0, invoices: 0, customers: new Set() },
      OTHER: { open: 0, invoices: 0, customers: new Set() },
    };
    let totalOpen = 0;
    let totalInvoices = 0;
    const allOpenCustomers = new Set<string>();

    for (const [cid, arr] of ordersByCustomer) {
      arr.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      );
      const totals = perCustomer.get(cid) ?? { debt: 0, payment: 0 };
      let pool = Math.max(totals.debt - totals.payment, 0);
      for (const o of arr) {
        const paid = paidByOrder.get(o.orderId) ?? 0;
        const perOrderNet = Math.max(o.debt - paid, 0);
        const share = Math.min(perOrderNet, pool);
        pool -= share;
        if (share <= 0.0001) continue;

        const bucketKey: 'DRIVER' | 'BRANCH' | 'OTHER' =
          o.issuerRole === SafariRole.DRIVER
            ? 'DRIVER'
            : o.issuerRole === SafariRole.MANAGER ||
                o.issuerRole === SafariRole.SUPERVISOR
              ? 'BRANCH'
              : 'OTHER';
        const b = buckets[bucketKey];
        b.open += share;
        b.invoices += 1;
        b.customers.add(cid);
        totalOpen += share;
        totalInvoices += 1;
        allOpenCustomers.add(cid);
      }
    }

    const rows: OpenDebtByIssuerRowDto[] = (
      ['DRIVER', 'BRANCH', 'OTHER'] as const
    ).map((k) => ({
      issuer: k,
      openDebtKd: buckets[k].open.toFixed(4),
      openInvoiceCount: buckets[k].invoices,
      openCustomerCount: buckets[k].customers.size,
    }));

    return {
      rows,
      totalOpenDebtKd: totalOpen.toFixed(4),
      openInvoiceCount: totalInvoices,
      openCustomerCount: allOpenCustomers.size,
      computedAt: new Date().toISOString(),
    };
  }
}

