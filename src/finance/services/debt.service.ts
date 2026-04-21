import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CashStatus,
  DebtEntityCategory,
  DebtSource,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
  SafariRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionService } from './subscription.service';
import type {
  UnpaidInvoiceRowDto,
  UnpaidInvoicesQueryDto,
  UnpaidInvoicesResponseDto,
} from '../dto/unpaid-invoices.dto';

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
   * V19.10 — "Unpaid Invoices List" (قائمة مديونيات الفواتير).
   *
   * Returns every invoice that contributed to outstanding customer
   * debt, aggregated per-order. Used by the new debts page.
   *
   * Implementation notes:
   * - Source is `DebtLedgerEntry` with `source = INVOICE_SHORTFALL`.
   *   Subscription-overuse debt is excluded (it belongs to the
   *   subscriber statement, not to a specific invoice).
   * - Rows are aggregated by `orderId`. Multiple ledger entries for
   *   the same invoice are summed.
   * - `currentCustomerDebtKd` joins the customer's live wallet so the
   *   UI can show current balance and highlight invoices whose
   *   customer has since cleared everything.
   * - Filters are additive. When `from/to` are omitted the report
   *   scans the entire history (cheap because the table is indexed
   *   by `(source, category, createdAt)`).
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

    // V19.10 — scope to invoices actually issued by field staff. Only
    // DRIVER and MANAGER (branch manager) create invoices from the POS;
    // Call Center never issues invoices, and OWNER/GM/ACCOUNTANT adjustments
    // should not leak into this operational list.
    const where: Prisma.DebtLedgerEntryWhereInput = {
      source: DebtSource.INVOICE_SHORTFALL,
      orderId: { not: null },
      actorUser: {
        is: {
          safariRole: { in: [SafariRole.DRIVER, SafariRole.MANAGER] },
        },
      },
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

    // 1) Fetch all matching entries with their context. We cap at
    //    20k to avoid accidental runaway queries — the page itself is
    //    filterable, so operators that exceed this should narrow down.
    const entries = await this.prisma.debtLedgerEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 20_000,
      select: {
        id: true,
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

    // 2) Aggregate per-invoice
    const byOrder = new Map<
      string,
      {
        row: UnpaidInvoiceRowDto;
        debtSum: number;
      }
    >();

    for (const e of entries) {
      if (!e.orderId || !e.order) continue;
      const amount = Number.parseFloat(e.amount.toString());
      if (!Number.isFinite(amount) || amount <= 0) continue;

      const existing = byOrder.get(e.orderId);
      if (existing) {
        existing.debtSum += amount;
        existing.row.entryCount += 1;
        // Keep the earliest issued-at (the invoice date) but the latest
        // lastEntryAt so operators see the most recent shortfall.
        if (new Date(e.createdAt) > new Date(existing.row.lastEntryAt)) {
          existing.row.lastEntryAt = e.createdAt.toISOString();
        }
        continue;
      }

      const actorRole =
        e.actorUser?.safariRole != null
          ? String(e.actorUser.safariRole)
          : null;

      byOrder.set(e.orderId, {
        debtSum: amount,
        row: {
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
          entryCount: 1,
          currentCustomerDebtKd: '0',
          isOpen: true,
          lastEntryAt: e.createdAt.toISOString(),
        },
      });
    }

    // 3) Pull current wallet state for every customer that shows up
    const customerIds = Array.from(
      new Set(
        Array.from(byOrder.values()).map((x) => x.row.customerId),
      ),
    );
    const wallets = customerIds.length
      ? await this.prisma.customerWallet.findMany({
          where: { customerId: { in: customerIds } },
          select: { customerId: true, balance: true, debt: true },
        })
      : [];
    const walletByCustomer = new Map<string, { openKd: number }>();
    for (const w of wallets) {
      const debt = Number.parseFloat(w.debt?.toString() ?? '0');
      const balance = Number.parseFloat(w.balance?.toString() ?? '0');
      const negBalance = balance < 0 ? -balance : 0;
      const openKd =
        (Number.isFinite(debt) && debt > 0 ? debt : 0) + negBalance;
      walletByCustomer.set(w.customerId, { openKd });
    }

    // 4) Finalize numbers & decide open/closed
    const finalRows: UnpaidInvoiceRowDto[] = [];
    let totalDebt = 0;
    let openDebt = 0;
    let totalInvoices = 0;
    let openInvoiceCount = 0;
    const openCustomers = new Set<string>();
    for (const [, v] of byOrder) {
      v.row.debtAmountKd = v.debtSum.toFixed(4);
      const open = walletByCustomer.get(v.row.customerId)?.openKd ?? 0;
      v.row.currentCustomerDebtKd = open.toFixed(4);
      v.row.isOpen = open > 0.0001;
      totalDebt += v.debtSum;
      const invTotal = Number.parseFloat(v.row.invoiceTotalKd);
      if (Number.isFinite(invTotal)) totalInvoices += invTotal;
      if (v.row.isOpen) {
        openDebt += v.debtSum;
        openInvoiceCount += 1;
        openCustomers.add(v.row.customerId);
      }
      finalRows.push(v.row);
    }

    // 5) Sort: open invoices first, newest issuedAt first
    finalRows.sort((a, b) => {
      if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
      return new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime();
    });

    const invoiceCount = finalRows.length;
    const customerCount = new Set(finalRows.map((r) => r.customerId)).size;
    const avgDebtPerInvoice =
      invoiceCount > 0 ? totalDebt / invoiceCount : 0;

    return {
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
      kpis: {
        invoiceCount,
        openInvoiceCount,
        customerCount,
        openCustomerCount: openCustomers.size,
        totalInvoicesKd: totalInvoices.toFixed(4),
        totalDebtKd: totalDebt.toFixed(4),
        openDebtKd: openDebt.toFixed(4),
        avgDebtPerInvoiceKd: avgDebtPerInvoice.toFixed(4),
      },
      rows: finalRows,
    };
  }
}

