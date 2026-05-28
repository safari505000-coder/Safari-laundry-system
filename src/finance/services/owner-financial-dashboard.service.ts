import { Injectable } from '@nestjs/common';
import {
  CashStatus,
  ManagerCashCustodyStatus,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
} from '@prisma/client';
import { computeCustomer360FinancialCoreBatch } from '../../customers/customer-360-financials';
import type { Customer360FinancialsDto } from '../../customers/customer-360.types';
import { JournalSourceService } from '../../general-ledger/journal-source.service';
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

/**
 * خدمة لوحة معلومات المالك المالية — توفر نظرة شاملة على الأداء المالي اليومي
 * Owner financial dashboard service providing a comprehensive view of daily financial
 * performance including KPIs, customer rollup, driver risk, and cash position.
 * Cached with short TTL via FinanceDashboardCacheService.
 */
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
    private readonly journalSource: JournalSourceService,
  ) {}

  /**
   * يُرجع لوحة معلومات المالك المالية الشاملة مع مؤشرات الأداء والعملاء والسائقين
   * Returns the owner financial dashboard with KPIs, customer rollup, driver risk,
   * and cash position. Short-TTL cached.
   *
   * @returns لوحة معلومات المالك المالية | Owner financial dashboard DTO
   */
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
      canonicalDebtTotal: customerRollup.canonicalDebtTotal,
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
    // V20.4 — DebtLedger removed; count CR on account 1300 (AR reductions = payments received).
    const journalLines = await this.prisma.journalLine.findMany({
      where: {
        account: { code: '1300' },
        credit: { gt: new Prisma.Decimal(0) },
        entry: {
          source: 'PAYMENT',
          createdAt: { gte: from, lte: to },
          ...(paidOrderIds.length > 0 ? { orderId: { notIn: paidOrderIds } } : {}),
        },
      },
      select: { credit: true },
      take: 5000,
    });
    const orderTotal = paidOrders.reduce(
      (sum, order) => sum.plus(order.totalPrice),
      new Prisma.Decimal(0),
    );
    const ledgerTotal = journalLines.reduce(
      (sum, l) => sum.plus(new Prisma.Decimal(l.credit.toString())),
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
    canonicalDebtTotal: string;
    topCustomers: OwnerTopCustomerDto[];
  }> {
    const customers = await this.prisma.customer.findMany({
      where: {
        orders: { some: { status: { not: OrderStatus.CANCELED } } },
      },
      select: { id: true, displayName: true, phone: true },
      orderBy: { updatedAt: 'desc' },
      take: CUSTOMER_LIMIT,
    });

    const customerIds = customers.map((customer) => customer.id);
    const journalArByCustomer =
      await this.journalSource.getCustomerDebtFromJournalARBatch(customerIds);
    const financialsByCustomer = await computeCustomer360FinancialCoreBatch(
      this.prisma,
      customerIds,
      { journalArByCustomer, skipAnomalyLogging: true },
    );

    const rows: Array<OwnerTopCustomerDto & { _due: Prisma.Decimal }> = [];
    let canonicalDebtTotal = new Prisma.Decimal(0);
    for (const customer of customers) {
      const financials = financialsByCustomer.get(customer.id);
      if (!financials) continue;
      const due = new Prisma.Decimal(financials.canonicalDebtKd);
      canonicalDebtTotal = canonicalDebtTotal.plus(due);
      if (due.lte(0)) continue;
      const intelligence = await this.customerIntelligence.buildCustomerIntelligence(
        customer.id,
        financialsForEvaluator(financials),
      );
      rows.push({
        customerId: customer.id,
        displayName: customer.displayName ?? customer.phone ?? null,
        canonicalDebtKd: financials.canonicalDebtKd,
        totalInvoicesKd: financials.totalInvoicesKd,
        totalPaymentsKd: financials.totalPaymentsKd,
        customerHealth: intelligence.customerHealth,
        paymentConsistency: intelligence.paymentConsistency,
        avgPaymentDelayHours: intelligence.avgPaymentDelayHours,
        lifetimeValueKd: intelligence.lifetimeValueKd,
        _due: due,
      });
    }

    // V23.2 — Decimal-precise sort, no JS double coercion. The `_due`
    // sidecar field is stripped by `_, ...rest` before returning so
    // the public DTO shape stays identical.
    rows.sort(
      (a, b) =>
        b._due.comparedTo(a._due) || a.customerId.localeCompare(b.customerId),
    );
    return {
      canonicalDebtTotal: canonicalDebtTotal.toFixed(4),
      topCustomers: rows
        .slice(0, 10)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ _due, ...row }) => row),
    };
  }
}

function financialsForEvaluator(financials: Customer360FinancialsDto) {
  return {
    consumedKd: financials.consumedKd,
    subscriptionValueKd: financials.subscriptionValueKd,
    subscriptionConsumedKd: financials.subscriptionConsumedKd,
    canonicalDebtKd: financials.canonicalDebtKd,
    isBlocked: financials.isBlocked,
  };
}

function toKd(value: Prisma.Decimal | null | undefined): string {
  return value?.toFixed(4) ?? '0.0000';
}
