import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CashStatus,
  ExpenseCategory,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
  SafariRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExpensesService } from '../expenses/expenses.service';
import { FixedExpenseService } from '../fixed-expenses/fixed-expense.service';
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

  /**
   * All orders created in the period (issued invoices), with optional filters.
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
  async dailyCashClosing(fromIso: string, toIso: string, branchId?: string) {
    const { from, to } = this.parseRange(fromIso, toIso);
    const cashOrders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.COMPLETED,
        completedAt: { gte: from, lte: to },
        posPaymentMethod: PosPaymentMethod.CASH,
        ...this.ordersForBranch(branchId),
      },
      select: { totalPrice: true },
    });
    const grossMinor = sumOrderMinors(
      cashOrders.map((o) => ({ totalPrice: o.totalPrice })),
    );
    const expensesTotal = await this.expensesService.sumInRange(from, to, branchId);
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
   * Profit engine: gross revenue (completed sales) minus variable (SOAP/FUEL + MISC),
   * paid payroll, and accrued fixed (rent/utility schedules).
   */
  async netProfitExecutive(fromIso: string, toIso: string, branchId?: string) {
    const { from, to } = this.parseRange(fromIso, toIso);

    const revenueAgg = await this.prisma.order.aggregate({
      where: {
        status: OrderStatus.COMPLETED,
        completedAt: { gte: from, lte: to },
        ...this.ordersForBranch(branchId),
      },
      _sum: { totalPrice: true },
    });
    const grossRevenueKd =
      revenueAgg._sum.totalPrice !== null &&
      revenueAgg._sum.totalPrice !== undefined
        ? revenueAgg._sum.totalPrice.toString()
        : '0';

    const variableSoapFuelKd = await this.expensesService.sumInRangeByCategories(
      from,
      to,
      [ExpenseCategory.SOAP, ExpenseCategory.FUEL],
      branchId,
    );
    const miscOperationalKd = await this.expensesService.sumInRangeByCategories(
      from,
      to,
      [ExpenseCategory.MISC],
      branchId,
    );
    const payrollPaidKd = await this.payrollService.sumPaidNetInRange(
      from,
      to,
      branchId,
    );
    const fixedExpensesKd = await this.fixedExpenseService.sumAccruedInRange(
      from,
      to,
      branchId,
    );

    const totalNonPayrollExpensesKd = new Prisma.Decimal(variableSoapFuelKd)
      .add(new Prisma.Decimal(miscOperationalKd))
      .add(new Prisma.Decimal(fixedExpensesKd))
      .toFixed(4);

    const netProfitKd = decSubMany(
      grossRevenueKd,
      variableSoapFuelKd,
      miscOperationalKd,
      payrollPaidKd,
      fixedExpensesKd,
    );

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      branchId: branchId ?? null,
      grossRevenueKd,
      variableSoapFuelKd,
      miscOperationalKd,
      fixedExpensesKd,
      payrollPaidKd,
      /** Red card: variable (incl. misc) + fixed — excludes payroll. */
      totalExpensesVariableAndFixedKd: totalNonPayrollExpensesKd,
      /** Gold: full P&L after payroll. */
      netProfitKd,
    };
  }
}
