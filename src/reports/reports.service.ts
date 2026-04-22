import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CashStatus,
  DebtSource,
  GeneralLedgerEntryType,
  LedgerTransactionType,
  ExpenseCategory,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
  SafariRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExpensesService } from '../expenses/expenses.service';
import { FixedExpenseService } from '../fixed-expenses/fixed-expense.service';
import { PaymentMethodFeesService } from '../payment-method-fees/payment-method-fees.service';
import { computeOrderBankFeeKd } from '../payment-method-fees/bank-fee.util';
import { PayrollService } from '../payroll/payroll.service';
import {
  minorToAmountString,
  sumOrderMinors,
} from '../finance/finance-money';

function decSubMany(base: string, ...subs: string[]): string {
  let x = new Prisma.Decimal(base);
  for (const s of subs) {
    x = x.sub(new Prisma.Decimal(s));
  }
  return x.toFixed(4);
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expensesService: ExpensesService,
    private readonly payrollService: PayrollService,
    private readonly fixedExpenseService: FixedExpenseService,
    private readonly paymentMethodFeesService: PaymentMethodFeesService,
  ) {}

  private parseRange(fromIso: string, toIso: string): { from: Date; to: Date } {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid date range');
    }
    return { from, to };
  }

  /** Completed sales attributed to drivers of this branch (driver.branchId). */
  private ordersForBranch(branchId?: string): Prisma.OrderWhereInput {
    if (!branchId) return {};
    return { driver: { branchId } };
  }

  private async getSubscriptionSubsidyInRange(
    from: Date,
    to: Date,
    branchId?: string,
  ): Promise<string> {
    const rows = await this.prisma.transactionHistory.findMany({
      where: {
        type: LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
        createdAt: { gte: from, lte: to },
      },
      select: { metadata: true },
    });
    let sum = new Prisma.Decimal(0);
    for (const row of rows) {
      const meta =
        row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : null;
      if (!meta) continue;
      const attributedBranchId =
        typeof meta.subsidyBranchId === 'string' ? meta.subsidyBranchId : null;
      if (branchId && attributedBranchId !== branchId) continue;
      const subsidy =
        typeof meta.subsidy === 'string' || typeof meta.subsidy === 'number'
          ? new Prisma.Decimal(String(meta.subsidy))
          : new Prisma.Decimal(0);
      if (subsidy.gt(0)) {
        sum = sum.add(subsidy);
      }
    }
    return sum.toFixed(4);
  }

  /**
   * "Issued invoices in range" — every order whose invoice was cut
   * during the window, regardless of whether the driver has finished
   * delivery / handed cash yet.
   *
   * A3.D6 contract (explicit to avoid drift with P&L / Executive reports):
   *   - Time axis: Order.createdAt (when the invoice was written at POS).
   *   - NOT Order.completedAt (that one is when the driver pressed
   *     "COMPLETED"; used by the Executive P&L because delivered
   *     revenue is what shows up on the books).
   *   - Canceled invoices are INCLUDED (so counts tie to the serial
   *     counter); filter by `status` client-side if you want
   *     COMPLETED-only.
   *
   * If you need a "completed in range" view use `completedOrders`
   * instead — that report filters on `completedAt`.
   */
  async issuedInvoices(
    fromIso: string,
    toIso: string,
    driverId?: string,
    posPaymentMethod?: PosPaymentMethod,
    branchId?: string,
  ) {
    const { from, to } = this.parseRange(fromIso, toIso);
    const rows = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        ...(driverId ? { driverId } : {}),
        ...(posPaymentMethod ? { posPaymentMethod } : {}),
        ...this.ordersForBranch(branchId),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        serviceType: true,
        totalPrice: true,
        cashStatus: true,
        invoiceNumber: true,
        posPaymentMethod: true,
        completedAt: true,
        createdAt: true,
        customer: {
          select: { id: true, phone: true, displayName: true },
        },
        driver: {
          select: {
            id: true,
            username: true,
            fullName: true,
            employeeId: true,
            branchId: true,
          },
        },
      },
    });
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      count: rows.length,
      rows: rows.map((r) => ({
        ...r,
        totalPrice: r.totalPrice.toString(),
      })),
    };
  }

  /**
   * Recent invoices across all branches — minimal payload for owner live feed.
   */
  async liveFeedRecent(limit = 10) {
    const take = Math.min(Math.max(limit, 1), 25);
    const rows = await this.prisma.order.findMany({
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        invoiceNumber: true,
        createdAt: true,
        totalPrice: true,
        customer: {
          select: { displayName: true, phone: true },
        },
        driver: {
          select: {
            branch: { select: { id: true, name: true } },
          },
        },
        lineItems: {
          select: {
            label: true,
            quantity: true,
            unitPrice: true,
          },
          orderBy: { createdAt: 'asc' },
          take: 32,
        },
      },
    });

    return {
      orders: rows.map((o) => ({
        id: o.id,
        invoiceNumber: o.invoiceNumber,
        createdAt: o.createdAt.toISOString(),
        totalPrice: o.totalPrice.toString(),
        customerName:
          o.customer.displayName?.trim() || o.customer.phone || '—',
        branchName: o.driver?.branch?.name ?? null,
        branchId: o.driver?.branch?.id ?? null,
        lineItemCount: o.lineItems.length,
        lines: o.lineItems.map((li) => ({
          label: li.label,
          quantity: li.quantity.toString(),
          unitPrice: li.unitPrice.toString(),
        })),
      })),
    };
  }

  /**
   * Driver field cash: orders still PAID_TO_DRIVER + optional activity in range.
   */
  async driverLedger(
    driverId: string,
    fromIso: string,
    toIso: string,
    branchId?: string,
  ) {
    const { from, to } = this.parseRange(fromIso, toIso);
    const driver = await this.prisma.user.findUnique({
      where: { id: driverId },
      select: {
        id: true,
        username: true,
        fullName: true,
        employeeId: true,
        phone: true,
        safariRole: true,
        branchId: true,
      },
    });
    if (!driver || driver.safariRole !== SafariRole.DRIVER) {
      throw new BadRequestException('Invalid driver');
    }
    if (branchId && driver.branchId !== branchId) {
      throw new BadRequestException('Driver does not belong to selected branch');
    }

    const pendingCashOrders = await this.prisma.order.findMany({
      where: {
        driverId,
        status: OrderStatus.COMPLETED,
        cashStatus: CashStatus.PAID_TO_DRIVER,
        posPaymentMethod: PosPaymentMethod.CASH,
      },
      select: { id: true, totalPrice: true, invoiceNumber: true, createdAt: true },
    });
    const heldMinor = sumOrderMinors(
      pendingCashOrders.map((o) => ({ totalPrice: o.totalPrice })),
    );

    const ordersInPeriod = await this.prisma.order.findMany({
      where: {
        driverId,
        createdAt: { gte: from, lte: to },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        totalPrice: true,
        cashStatus: true,
        posPaymentMethod: true,
        invoiceNumber: true,
        completedAt: true,
        createdAt: true,
      },
    });

    return {
      driver,
      owedToOfficeKd: minorToAmountString(heldMinor),
      pendingSettlementOrderCount: pendingCashOrders.length,
      period: { from: from.toISOString(), to: to.toISOString() },
      ordersInPeriod: ordersInPeriod.map((o) => ({
        ...o,
        totalPrice: o.totalPrice.toString(),
      })),
    };
  }

  /**
   * Daily closing: POS cash sales minus branch expenses in range.
   */
  async dailyCashClosing(
    fromIso: string,
    toIso: string,
    branchId?: string,
    driverId?: string,
  ) {
    const { from, to } = this.parseRange(fromIso, toIso);
    const cashOrders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.COMPLETED,
        completedAt: { gte: from, lte: to },
        posPaymentMethod: PosPaymentMethod.CASH,
        ...this.ordersForBranch(branchId),
        ...(driverId ? { driverId } : {}),
      },
      select: { totalPrice: true },
    });
    const grossMinor = sumOrderMinors(
      cashOrders.map((o) => ({ totalPrice: o.totalPrice })),
    );
    const expensesTotal = await this.expensesService.sumInRange(
      from,
      to,
      branchId,
      driverId,
    );
    const expensesMinor = BigInt(
      Math.round(Number.parseFloat(expensesTotal) * 10_000),
    );
    const netMinor = grossMinor - expensesMinor;
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      grossCashSalesKd: minorToAmountString(grossMinor),
      expensesTotalKd: expensesTotal,
      netCashAfterExpensesKd: minorToAmountString(netMinor),
      cashOrderCount: cashOrders.length,
    };
  }

  /**
   * V8.5 — Sum payment-rail bank fees on non-cash electronic settlements
   * (KNET / payment link / online). Reporting only — invoice `totalPrice`
   * rows are unchanged.
   */
  private async aggregateBankFeesForCompletedOrders(
    from: Date,
    to: Date,
    branchId?: string,
    driverId?: string,
  ): Promise<{
    totalBankFeesKd: string;
    settledRevenueAfterBankFeesKd: string;
    byBranch: Array<{ branchId: string | null; bankFeesKd: string }>;
  }> {
    const config = await this.paymentMethodFeesService.getConfig();
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.COMPLETED,
        completedAt: { gte: from, lte: to },
        ...this.ordersForBranch(branchId),
        ...(driverId ? { driverId } : {}),
      },
      select: {
        totalPrice: true,
        posPaymentMethod: true,
        driver: { select: { branchId: true } },
      },
    });

    const byBranch = new Map<string | null, Prisma.Decimal>();
    let totalFees = new Prisma.Decimal(0);
    let grossAll = new Prisma.Decimal(0);

    for (const o of orders) {
      const gross = new Prisma.Decimal(o.totalPrice.toString());
      grossAll = grossAll.add(gross);
      const fee = computeOrderBankFeeKd(gross, o.posPaymentMethod, config);
      totalFees = totalFees.add(fee);
      const bid = o.driver?.branchId ?? null;
      const prev = byBranch.get(bid) ?? new Prisma.Decimal(0);
      byBranch.set(bid, prev.add(fee));
    }

    const settled = grossAll.sub(totalFees);
    const branchRows = [...byBranch.entries()].map(([id, v]) => ({
      branchId: id,
      bankFeesKd: v.toFixed(4),
    }));
    branchRows.sort((a, b) =>
      (a.branchId ?? '').localeCompare(b.branchId ?? ''),
    );

    return {
      totalBankFeesKd: totalFees.toFixed(4),
      settledRevenueAfterBankFeesKd: settled.toFixed(4),
      byBranch: branchRows,
    };
  }

  /**
   * Profit engine: gross revenue (completed sales) minus bank fees (V8.5),
   * variable (SOAP/FUEL + MISC), paid payroll, and accrued fixed.
   */
  async netProfitExecutive(
    fromIso: string,
    toIso: string,
    branchId?: string,
    driverId?: string,
  ) {
    const { from, to } = this.parseRange(fromIso, toIso);

    const revenueAgg = await this.prisma.order.aggregate({
      where: {
        status: OrderStatus.COMPLETED,
        completedAt: { gte: from, lte: to },
        ...this.ordersForBranch(branchId),
        ...(driverId ? { driverId } : {}),
      },
      _sum: { totalPrice: true },
    });
    const grossRevenueKd =
      revenueAgg._sum.totalPrice !== null &&
      revenueAgg._sum.totalPrice !== undefined
        ? revenueAgg._sum.totalPrice.toString()
        : '0';

    const bankAgg = await this.aggregateBankFeesForCompletedOrders(
      from,
      to,
      branchId,
      driverId,
    );
    const bankFeesTotalKd = bankAgg.totalBankFeesKd;
    const settledRevenueAfterBankFeesKd = bankAgg.settledRevenueAfterBankFeesKd;

    const variableSoapFuelKd = await this.expensesService.sumInRangeByCategories(
      from,
      to,
      [ExpenseCategory.SOAP, ExpenseCategory.FUEL],
      branchId,
      driverId,
    );
    const miscOperationalKd = await this.expensesService.sumInRangeByCategories(
      from,
      to,
      [ExpenseCategory.MISC],
      branchId,
      driverId,
    );
    const payrollPaidKd = driverId
      ? '0.0000'
      : await this.payrollService.sumPaidNetInRange(from, to, branchId);
    const fixedExpensesKd = driverId
      ? '0.0000'
      : await this.fixedExpenseService.sumAccruedInRange(from, to, branchId);
    const subscriptionSubsidyKd = driverId
      ? '0.0000'
      : await this.getSubscriptionSubsidyInRange(from, to, branchId);
    const enterpriseSubscriptionSubsidyKd = driverId
      ? '0.0000'
      : await this.getSubscriptionSubsidyInRange(from, to);

    const totalNonPayrollExpensesKd = new Prisma.Decimal(variableSoapFuelKd)
      .add(new Prisma.Decimal(miscOperationalKd))
      .add(new Prisma.Decimal(fixedExpensesKd))
      .toFixed(4);

    const netProfitKd = driverId
      ? decSubMany(
          grossRevenueKd,
          bankFeesTotalKd,
          variableSoapFuelKd,
          miscOperationalKd,
        )
      : decSubMany(
          grossRevenueKd,
          bankFeesTotalKd,
          variableSoapFuelKd,
          miscOperationalKd,
          payrollPaidKd,
          fixedExpensesKd,
        );

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      branchId: branchId ?? null,
      driverId: driverId ?? null,
      grossRevenueKd,
      /** V8.5 — internal bank/acquirer fees on non-cash rails (reporting only). */
      bankFeesTotalKd,
      /**
       * Gross completed sales minus bank fees — “settled” revenue before
       * soap/misc/payroll/fixed deductions.
       */
      settledRevenueAfterBankFeesKd,
      variableSoapFuelKd,
      miscOperationalKd,
      fixedExpensesKd,
      subscriptionSubsidyKd,
      enterpriseSubscriptionSubsidyKd,
      payrollPaidKd,
      /** Red card: variable (incl. misc) + fixed — excludes payroll. */
      totalExpensesVariableAndFixedKd: totalNonPayrollExpensesKd,
      /** Gold: full P&L after payroll (driver scope excludes payroll/fixed). */
      netProfitKd,
    };
  }

  /**
   * V19.14 — Collection breakdown for completed orders in a range.
   *
   * Splits gross revenue into what was actually collected (any cash
   * status other than UNPAID — the customer paid in some form: cash
   * with the driver, card terminal, online, subscription wallet, or
   * the manager already handed it over to the office) vs what is
   * still on the customer's debt (UNPAID: `DEBT_ON_ACCOUNT` orders
   * + any completed invoice that never cleared its balance).
   *
   * Driver-scope excludes subscription-wallet debits because the
   * field drivers never "collect" those — the wallet is already
   * settled at POS time.
   */
  private async computeCollectionsForRange(
    from: Date,
    to: Date,
    branchId?: string,
  ): Promise<{
    collectedRevenueKd: string;
    uncollectedRevenueKd: string;
  }> {
    const rows = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.COMPLETED,
        completedAt: { gte: from, lte: to },
        ...this.ordersForBranch(branchId),
      },
      select: { totalPrice: true, cashStatus: true },
    });
    let collected = new Prisma.Decimal(0);
    let uncollected = new Prisma.Decimal(0);
    for (const o of rows) {
      const amount = new Prisma.Decimal(o.totalPrice.toString());
      if (o.cashStatus === CashStatus.UNPAID) {
        uncollected = uncollected.add(amount);
      } else {
        collected = collected.add(amount);
      }
    }
    return {
      collectedRevenueKd: collected.toFixed(4),
      uncollectedRevenueKd: uncollected.toFixed(4),
    };
  }

  /**
   * V19.14.3 — Cash collected *during* [from, to] that retires debt on
   * **a specific invoice** whose `completedAt` is **strictly before**
   * `from`.
   *
   * Customer-level PAYMENT rows (`orderId` null) — CC partial pay,
   * residual subscription chunks, etc. — are **excluded** from this
   * KPI. They are not "فواتير قبل الفترة" and were wrongly inflating
   * the tile when the owner had zero pre-period invoices.
   *
   * If we need those amounts surfaced later, add a separate field
   * (e.g. unallocatedDebtPaymentsKd) instead of mixing them here.
   */
  private async computeDebtPaymentsInRange(
    from: Date,
    to: Date,
    branchId?: string,
  ): Promise<string> {
    const payments = await this.prisma.debtLedgerEntry.findMany({
      where: {
        source: DebtSource.PAYMENT,
        createdAt: { gte: from, lte: to },
        orderId: { not: null },
        ...(branchId ? { branchId } : {}),
      },
      select: {
        amount: true,
        orderId: true,
        order: { select: { completedAt: true } },
      },
    });
    let sum = new Prisma.Decimal(0);
    for (const p of payments) {
      if (!p.orderId) continue;
      const completedAt = p.order?.completedAt;
      if (completedAt && completedAt < from) {
        sum = sum.add(new Prisma.Decimal(p.amount.toString()));
      }
    }
    return sum.toFixed(4);
  }

  /**
   * V19.14 — Current outstanding customer debt (point-in-time snapshot).
   *
   * This is NOT limited to the reporting window — it's whatever
   * customers still owe the company as of right now. Mirrors the
   * red KPI on the Finance Overview:
   *   SUM(INVOICE_SHORTFALL + SUBSCRIPTION_OVERUSE) − SUM(PAYMENT)
   *
   * Per-branch scope filters DebtLedgerEntry.branchId. Rows with a
   * null branch (legacy / cross-branch adjustments) are excluded
   * from branch totals but included in the consolidated figure.
   */
  private async computeOutstandingDebt(branchId?: string): Promise<string> {
    const grouped = await this.prisma.debtLedgerEntry.groupBy({
      by: ['source'],
      where: branchId ? { branchId } : {},
      _sum: { amount: true },
    });
    let owed = new Prisma.Decimal(0);
    let paid = new Prisma.Decimal(0);
    for (const g of grouped) {
      const amount = new Prisma.Decimal(g._sum.amount?.toString() ?? '0');
      if (g.source === 'PAYMENT') {
        paid = paid.add(amount);
      } else {
        // INVOICE_SHORTFALL + SUBSCRIPTION_OVERUSE
        owed = owed.add(amount);
      }
    }
    const open = owed.sub(paid);
    return (open.isNegative() ? new Prisma.Decimal(0) : open).toFixed(4);
  }

  /**
   * V19.13 — Monthly summary: one consolidated P&L + a row per branch.
   *
   * The consolidated block is identical to `netProfitExecutive(from, to)`
   * with no branch filter; each branch row is the same shape scoped to
   * that branch's drivers. All rows share identical field names so the
   * frontend can render a single table and a stack of branch cards from
   * the same DTO.
   *
   * V19.14 — Also surfaces collection health:
   *   • `collectedRevenueKd`       — this period's invoices paid when issued
   *   • `debtPaymentsReceivedKd`   — cash collected this period against OLD debts
   *   • `uncollectedRevenueKd`     — this period's invoices still on debt
   *   • `outstandingDebtKd`        — total open customer debt right now
   */
  async monthlySummary(fromIso: string, toIso: string) {
    const { from, to } = this.parseRange(fromIso, toIso);
    const [
      consolidated,
      branches,
      consolidatedCollections,
      consolidatedDebtPayments,
      outstandingDebtKd,
    ] = await Promise.all([
      this.netProfitExecutive(fromIso, toIso),
      this.prisma.branch.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      this.computeCollectionsForRange(from, to),
      this.computeDebtPaymentsInRange(from, to),
      this.computeOutstandingDebt(),
    ]);

    /**
     * V19.13.1 — subscription subsidy (`دعم الاشتراكات`) is a real
     * deduction from net profit: it represents the discount the group
     * grants to subsidised subscriptions, so leaving it out of the
     * monthly net overstates what the owner actually pocketed. We
     * subtract it here (after the base formula computed by
     * `netProfitExecutive`) instead of mutating the shared executive
     * endpoint — the financials page keeps its own presentation
     * contract, and the monthly summary owns this nuance.
     */
    const netWithSubsidy = (base: string, subsidy: string): string => {
      const n =
        Number.parseFloat(base || '0') - Number.parseFloat(subsidy || '0');
      if (!Number.isFinite(n)) return base;
      return n.toFixed(4);
    };

    const perBranch = await Promise.all(
      branches.map(async (b) => {
        const [row, coll, debtPayments, openDebt] = await Promise.all([
          this.netProfitExecutive(fromIso, toIso, b.id),
          this.computeCollectionsForRange(from, to, b.id),
          this.computeDebtPaymentsInRange(from, to, b.id),
          this.computeOutstandingDebt(b.id),
        ]);
        return {
          branchId: b.id,
          branchName: b.name,
          grossRevenueKd: row.grossRevenueKd,
          bankFeesTotalKd: row.bankFeesTotalKd,
          settledRevenueAfterBankFeesKd: row.settledRevenueAfterBankFeesKd,
          variableSoapFuelKd: row.variableSoapFuelKd,
          miscOperationalKd: row.miscOperationalKd,
          fixedExpensesKd: row.fixedExpensesKd,
          payrollPaidKd: row.payrollPaidKd,
          totalExpensesVariableAndFixedKd: row.totalExpensesVariableAndFixedKd,
          subscriptionSubsidyKd: row.subscriptionSubsidyKd,
          netProfitKd: netWithSubsidy(
            row.netProfitKd,
            row.subscriptionSubsidyKd,
          ),
          collectedRevenueKd: coll.collectedRevenueKd,
          uncollectedRevenueKd: coll.uncollectedRevenueKd,
          debtPaymentsReceivedKd: debtPayments,
          outstandingDebtKd: openDebt,
        };
      }),
    );

    return {
      from: consolidated.from,
      to: consolidated.to,
      consolidated: {
        grossRevenueKd: consolidated.grossRevenueKd,
        bankFeesTotalKd: consolidated.bankFeesTotalKd,
        settledRevenueAfterBankFeesKd: consolidated.settledRevenueAfterBankFeesKd,
        variableSoapFuelKd: consolidated.variableSoapFuelKd,
        miscOperationalKd: consolidated.miscOperationalKd,
        fixedExpensesKd: consolidated.fixedExpensesKd,
        payrollPaidKd: consolidated.payrollPaidKd,
        totalExpensesVariableAndFixedKd:
          consolidated.totalExpensesVariableAndFixedKd,
        subscriptionSubsidyKd: consolidated.subscriptionSubsidyKd,
        netProfitKd: netWithSubsidy(
          consolidated.netProfitKd,
          consolidated.subscriptionSubsidyKd,
        ),
        collectedRevenueKd: consolidatedCollections.collectedRevenueKd,
        uncollectedRevenueKd: consolidatedCollections.uncollectedRevenueKd,
        debtPaymentsReceivedKd: consolidatedDebtPayments,
        outstandingDebtKd,
      },
      branches: perBranch,
    };
  }

  /**
   * V8.5 — Per-branch bank fee allocation (completed orders), for Owner radar.
   */
  async bankFeesByBranch(fromIso: string, toIso: string) {
    const { from, to } = this.parseRange(fromIso, toIso);
    const agg = await this.aggregateBankFeesForCompletedOrders(from, to);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totalBankFeesKd: agg.totalBankFeesKd,
      branches: agg.byBranch,
    };
  }

  /**
   * Unified ledger + deposits for accountant “financial stream” (POS, expenses, deposits).
   */
  async unifiedLedgerStream(
    fromIso: string,
    toIso: string,
    driverId?: string,
    branchId?: string,
  ) {
    const { from, to } = this.parseRange(fromIso, toIso);
    // A3.D4 — Previously this stream only surfaced POS_SALE_COMPLETED and
    // EXPENSE_RECORDED. That made the "Unified" ledger silently hide custody
    // verification (WALLET_SETTLEMENT) and debt adjustments (DEBT_ADJUSTMENT)
    // that are also part of the Dastur money cycle — see
    // docs/DUSTUR_TASHGHIL_SAFARI.md §2 and reports.service.unifiedLedgerStream
    // tests. Now every GL entry type participates in the stream.
    const glWhere: Prisma.GeneralLedgerEntryWhereInput = {
      createdAt: { gte: from, lte: to },
      entryType: {
        in: [
          GeneralLedgerEntryType.POS_SALE_COMPLETED,
          GeneralLedgerEntryType.EXPENSE_RECORDED,
          GeneralLedgerEntryType.WALLET_SETTLEMENT,
          GeneralLedgerEntryType.DEBT_ADJUSTMENT,
        ],
      },
    };
    if (driverId) {
      const [driverOrderIds, driverExpenseIds] = await Promise.all([
        this.prisma.order.findMany({
          where: { driverId },
          select: { id: true },
        }),
        this.prisma.branchExpense.findMany({
          where: { recordedById: driverId },
          select: { id: true },
        }),
      ]);
      const oids = driverOrderIds.map((o) => o.id);
      const eids = driverExpenseIds.map((e) => e.id);
      glWhere.OR = [
        { actorUserId: driverId },
        ...(oids.length ? [{ orderId: { in: oids } }] : []),
        ...(eids.length ? [{ expenseId: { in: eids } }] : []),
      ];
    }
    const glRows = await this.prisma.generalLedgerEntry.findMany({
      where: glWhere,
      orderBy: { createdAt: 'desc' },
      take: 800,
    });
    const orderIds = [
      ...new Set(glRows.map((r) => r.orderId).filter((x): x is string => !!x)),
    ];
    const expenseIds = [
      ...new Set(glRows.map((r) => r.expenseId).filter((x): x is string => !!x)),
    ];
    type OrdRow = {
      id: string;
      driverId: string | null;
      posPaymentMethod: PosPaymentMethod | null;
      invoiceNumber: string | null;
      driver: { id: string; fullName: string; branchId: string | null } | null;
    };
    type ExpRow = {
      id: string;
      title: string;
      category: ExpenseCategory;
      receiptUrl: string | null;
      recordedById: string;
      recordedBy: { fullName: string } | null;
    };
    let orders: OrdRow[] = [];
    let expenses: ExpRow[] = [];
    if (orderIds.length) {
      orders = await this.prisma.order.findMany({
        where: {
          id: { in: orderIds },
          ...this.ordersForBranch(branchId),
        },
        select: {
          id: true,
          driverId: true,
          posPaymentMethod: true,
          invoiceNumber: true,
          driver: { select: { id: true, fullName: true, branchId: true } },
        },
      });
    }
    if (expenseIds.length) {
      expenses = await this.prisma.branchExpense.findMany({
        where: {
          id: { in: expenseIds },
          ...this.branchWhere(branchId),
        },
        select: {
          id: true,
          title: true,
          category: true,
          receiptUrl: true,
          recordedById: true,
          recordedBy: { select: { fullName: true } },
        },
      });
    }
    const orderMap = new Map(orders.map((o) => [o.id, o] as const));
    const expenseMap = new Map(expenses.map((e) => [e.id, e] as const));

    const out: Array<{
      id: string;
      at: string;
      streamType: string;
      amountKd: string;
      memo: string | null;
      driverId: string | null;
      driverName: string | null;
      attachmentUrl: string | null;
      refKind: 'ORDER' | 'EXPENSE' | 'DEPOSIT' | 'GL';
      refId: string;
    }> = [];

    const saleType = (m: PosPaymentMethod | string | null | undefined): string => {
      if (m === null || m === undefined) return 'OTHER_SALE';
      if (m === PosPaymentMethod.CASH) return 'CASH_SALE';
      if (m === PosPaymentMethod.KNET) return 'KNET_SALE';
      if (m === PosPaymentMethod.PAYMENT_LINK || m === PosPaymentMethod.ONLINE)
        return 'ONLINE_SALE';
      if (m === PosPaymentMethod.DEBT_ON_ACCOUNT) return 'DEBT_SALE';
      if (m === PosPaymentMethod.SUBSCRIPTION_WALLET) return 'WALLET_SALE';
      return 'OTHER_SALE';
    };

    for (const row of glRows) {
      if (row.entryType === GeneralLedgerEntryType.POS_SALE_COMPLETED && row.orderId) {
        const ord = orderMap.get(row.orderId);
        if (!ord) continue;
        if (branchId && ord.driver?.branchId !== branchId) continue;
        const meta =
          row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : {};
        const pm = meta.posPaymentMethod as PosPaymentMethod | undefined;
        const method = pm ?? ord.posPaymentMethod;
        out.push({
          id: row.id,
          at: row.createdAt.toISOString(),
          streamType: saleType(method),
          amountKd: row.amount.toString(),
          memo: row.memo,
          driverId: ord.driverId,
          driverName: ord.driver?.fullName ?? null,
          attachmentUrl: null,
          refKind: 'ORDER',
          refId: ord.id,
        });
      } else if (
        row.entryType === GeneralLedgerEntryType.EXPENSE_RECORDED &&
        row.expenseId
      ) {
        const exp = expenseMap.get(row.expenseId);
        if (!exp) continue;
        const streamType =
          exp.category === ExpenseCategory.FUEL ? 'FUEL_EXPENSE' : 'OTHER_EXPENSE';
        const attach =
          typeof exp.receiptUrl === 'string' && exp.receiptUrl.trim().length > 0 ?
            exp.receiptUrl.trim()
          : null;
        out.push({
          id: row.id,
          at: row.createdAt.toISOString(),
          streamType,
          amountKd: row.amount.toString(),
          memo: exp.title,
          driverId: exp.recordedById,
          driverName: exp.recordedBy?.fullName ?? null,
          attachmentUrl: attach,
          refKind: 'EXPENSE',
          refId: exp.id,
        });
      } else if (row.entryType === GeneralLedgerEntryType.WALLET_SETTLEMENT) {
        // Bank/Custody settlement event — emitted by
        // ManagerCustodyService.verifyCustody when a bag is validated and
        // deposited at the bank. Not tied to a single order row.
        out.push({
          id: row.id,
          at: row.createdAt.toISOString(),
          streamType: 'CUSTODY_VERIFIED',
          amountKd: row.amount.toString(),
          memo: row.memo,
          driverId: null,
          driverName: null,
          attachmentUrl: null,
          refKind: 'GL',
          refId: row.id,
        });
      } else if (row.entryType === GeneralLedgerEntryType.DEBT_ADJUSTMENT) {
        // Debt adjustments arise from: (a) wallet shortfall at checkout,
        // (b) debt transfers between drivers, (c) subscription activation
        // that pays down existing debt. Sign can be positive (debt added)
        // or negative (debt paid down). Render memo straight through.
        const ordRef =
          row.orderId && orderMap.has(row.orderId) ? orderMap.get(row.orderId)! : null;
        if (branchId && ordRef && ordRef.driver?.branchId !== branchId) continue;
        out.push({
          id: row.id,
          at: row.createdAt.toISOString(),
          streamType: 'DEBT_ADJUSTMENT',
          amountKd: row.amount.toString(),
          memo: row.memo,
          driverId: ordRef?.driverId ?? null,
          driverName: ordRef?.driver?.fullName ?? null,
          attachmentUrl: null,
          refKind: ordRef ? 'ORDER' : 'GL',
          refId: ordRef?.id ?? row.id,
        });
      }
    }

    const depositWhere: Prisma.DepositWhereInput = {
      createdAt: { gte: from, lte: to },
      ...(driverId ? { driverId } : {}),
      ...(branchId ?
        { driver: { branchId } }
      : {}),
    };
    const deposits = await this.prisma.deposit.findMany({
      where: depositWhere,
      orderBy: { createdAt: 'desc' },
      take: 400,
      select: {
        id: true,
        amount: true,
        createdAt: true,
        receiptImage: true,
        driverId: true,
        driver: { select: { fullName: true } },
      },
    });
    for (const d of deposits) {
      out.push({
        id: `dep-${d.id}`,
        at: d.createdAt.toISOString(),
        streamType: 'DEPOSIT',
        amountKd: d.amount.toString(),
        memo: 'Driver deposit',
        driverId: d.driverId,
        driverName: d.driver.fullName,
        attachmentUrl: d.receiptImage,
        refKind: 'DEPOSIT',
        refId: d.id,
      });
    }

    out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      rows: out,
    };
  }

  private branchWhere(
    branchId?: string,
  ): Pick<Prisma.BranchExpenseWhereInput, 'branchId'> | Record<string, never> {
    if (!branchId) return {};
    return { branchId };
  }
}
