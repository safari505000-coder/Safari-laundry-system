import { Injectable } from '@nestjs/common';
import {
  CashStatus,
  DebtSource,
  ManagerCashCustodyStatus,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
} from '@prisma/client';
import { computeCustomer360FinancialCore } from '../../customers/customer-360-financials';
import type { Customer360FinancialsDto } from '../../customers/customer-360.types';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountantDashboardPeriod } from '../dto/accountant-dashboard-query.dto';
import type {
  OwnerFinancialDashboardDto,
  OwnerTopCustomerDto,
} from '../dto/owner-financial-dashboard.dto';
import { AccountantDashboardService } from './accountant-dashboard.service';
import { CashService } from './cash.service';
import { CustomerIntelligenceService } from './customer-intelligence.service';
import { DriverRiskService } from './driver-risk.service';
import { FinanceDashboardCacheService } from './finance-dashboard-cache.service';
import { FinancialAlertsService } from './financial-alerts.service';

const CUSTOMER_LIMIT =
  Number.parseInt(process.env.FINANCE_OWNER_DASHBOARD_CUSTOMER_LIMIT ?? '500', 10) || 500;

@Injectable()
export class OwnerFinancialDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cashService: CashService,
    private readonly accountantDashboard: AccountantDashboardService,
    private readonly customerIntelligence: CustomerIntelligenceService,
    private readonly driverRisk: DriverRiskService,
    private readonly alerts: FinancialAlertsService,
    private readonly cache: FinanceDashboardCacheService,
  ) {}

  getDashboard(): Promise<OwnerFinancialDashboardDto> {
    const key = this.cache.cacheKey('owner-financial-dashboard', {
      v: '1',
      limit: String(CUSTOMER_LIMIT),
    });
    return this.cache.wrapJson(key, () => this.buildDashboard());
  }

  private async buildDashboard(): Promise<OwnerFinancialDashboardDto> {
    const now = new Date();
    const { cur, prev } = this.accountantDashboard.resolveWindow(
      AccountantDashboardPeriod.TODAY,
      now,
    );

    const [
      totalInvoicesToday,
      totalPaymentsToday,
      customerRollup,
      cashInDrivers,
      cashInOffice,
      reconciliation,
      riskyDrivers,
      expenseTotals,
    ] = await Promise.all([
      this.totalInvoices(cur.from, cur.to),
      this.totalPayments(cur.from, cur.to),
      this.customerRollup(),
      this.cashService.getTotalCashWithDrivers(),
      this.cashInOffice(),
      this.accountantDashboard.getReconciliation({
        period: AccountantDashboardPeriod.TODAY,
      }),
      this.driverRisk.getRiskyDrivers(10),
      this.alerts.expenseWindowTotals(this.prisma, cur, prev),
    ]);

    const alerts = await this.alerts.buildAlerts({
      topCustomers: customerRollup.topCustomers,
      riskyDrivers,
      reconciliationDifferenceKd: reconciliation.differenceKd,
      expenseCurrentKd: expenseTotals.currentKd,
      expensePreviousKd: expenseTotals.previousKd,
      now,
    });

    return {
      generatedAt: now.toISOString(),
      totalInvoicesToday,
      totalPaymentsToday,
      totalDueTotal: customerRollup.totalDueTotal,
      cashInDrivers,
      cashInOffice,
      reconciliationDifference: reconciliation.differenceKd,
      alerts,
      topCustomers: customerRollup.topCustomers,
      riskyDrivers,
    };
  }

  private async totalInvoices(from: Date, to: Date): Promise<string> {
    const agg = await this.prisma.order.aggregate({
      where: {
        status: { not: OrderStatus.CANCELED },
        createdAt: { gte: from, lte: to },
      },
      _sum: { totalPrice: true },
    });
    return toKd(agg._sum.totalPrice);
  }

  private async totalPayments(from: Date, to: Date): Promise<string> {
    const paidOrders = await this.prisma.order.findMany({
      where: {
        status: { not: OrderStatus.CANCELED },
        completedAt: { gte: from, lte: to },
        cashStatus: {
          in: [
            CashStatus.PAID_TO_DRIVER,
            CashStatus.PAID_ONLINE,
            CashStatus.HANDED_OVER_TO_OFFICE,
          ],
        },
        posPaymentMethod: { not: PosPaymentMethod.DEBT_ON_ACCOUNT },
      },
      select: { id: true, totalPrice: true },
      take: 5000,
    });
    const paidOrderIds = paidOrders.map((order) => order.id);
    const ledgerPayments = await this.prisma.debtLedgerEntry.findMany({
      where: {
        source: DebtSource.PAYMENT,
        createdAt: { gte: from, lte: to },
        ...(paidOrderIds.length > 0 ? { orderId: { notIn: paidOrderIds } } : {}),
      },
      select: { amount: true },
      take: 5000,
    });
    const orderTotal = paidOrders.reduce(
      (sum, order) => sum.plus(order.totalPrice),
      new Prisma.Decimal(0),
    );
    const ledgerTotal = ledgerPayments.reduce(
      (sum, row) => sum.plus(row.amount.abs()),
      new Prisma.Decimal(0),
    );
    return orderTotal.plus(ledgerTotal).toFixed(4);
  }

  private async cashInOffice(): Promise<string> {
    const agg = await this.prisma.managerCashCustody.aggregate({
      where: {
        status: {
          in: [
            ManagerCashCustodyStatus.PENDING_DEPOSIT,
            ManagerCashCustodyStatus.AWAITING_VERIFICATION,
          ],
        },
      },
      _sum: { amountKd: true },
    });
    return toKd(agg._sum.amountKd);
  }

  private async customerRollup(): Promise<{
    totalDueTotal: string;
    topCustomers: OwnerTopCustomerDto[];
  }> {
    const customers = await this.prisma.customer.findMany({
      where: {
        OR: [
          { orders: { some: { status: { not: OrderStatus.CANCELED } } } },
          { debtLedgerEntries: { some: {} } },
        ],
      },
      select: { id: true, displayName: true, phone: true },
      orderBy: { updatedAt: 'desc' },
      take: CUSTOMER_LIMIT,
    });

    const rows: OwnerTopCustomerDto[] = [];
    let totalDue = new Prisma.Decimal(0);
    for (const customer of customers) {
      const financials = await computeCustomer360FinancialCore(this.prisma, customer.id);
      const due = new Prisma.Decimal(financials.totalDueKd);
      totalDue = totalDue.plus(due);
      if (due.lte(0)) continue;
      const intelligence = await this.customerIntelligence.buildCustomerIntelligence(
        customer.id,
        financialsForEvaluator(financials),
      );
      rows.push({
        customerId: customer.id,
        displayName: customer.displayName ?? customer.phone ?? null,
        totalDueKd: financials.totalDueKd,
        totalInvoicesKd: financials.totalInvoicesKd,
        totalPaymentsKd: financials.totalPaymentsKd,
        customerHealth: intelligence.customerHealth,
        paymentConsistency: intelligence.paymentConsistency,
        avgPaymentDelayHours: intelligence.avgPaymentDelayHours,
        lifetimeValueKd: intelligence.lifetimeValueKd,
      });
    }

    rows.sort(
      (a, b) =>
        Number.parseFloat(b.totalDueKd) - Number.parseFloat(a.totalDueKd) ||
        a.customerId.localeCompare(b.customerId),
    );
    return {
      totalDueTotal: totalDue.toFixed(4),
      topCustomers: rows.slice(0, 10),
    };
  }
}

function financialsForEvaluator(financials: Customer360FinancialsDto) {
  return {
    consumedKd: financials.consumedKd,
    subscriptionValueKd: financials.subscriptionValueKd,
    subscriptionConsumedKd: financials.subscriptionConsumedKd,
    totalDueKd: financials.totalDueKd,
    isBlocked: financials.isBlocked,
  };
}

function toKd(value: Prisma.Decimal | null | undefined): string {
  return value?.toFixed(4) ?? '0.0000';
}
