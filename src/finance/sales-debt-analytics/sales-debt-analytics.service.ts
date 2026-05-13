import { Injectable, Logger } from '@nestjs/common';
import { CashStatus, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SalesDebtAnalyticsGroupDto,
  SalesDebtAnalyticsResponseDto,
  SalesDebtInsightDto,
} from './dto/sales-debt-analytics.dto';

/**
 * V24 — Wave B sales-debt aggregator.
 *
 * Replaces the FE-side `web/src/lib/sales-debt-analytics.ts` and
 * `sales-debt-insights.ts` modules. The browser used to fetch every
 * invoice in the date range and run `reduce()` in JS to build
 * per-branch / per-driver totals, then synthesise insight badges.
 * Per V24 Commandment #5 ("Don't Calculate, Just Ask") the server
 * now performs every aggregation in `Prisma.Decimal` arithmetic and
 * ships canonical 4dp KWD strings.
 *
 * Scope of "collected": mirrors the FE helper's cash-status fallback
 * path — an order counts as fully collected when its `cashStatus`
 * is one of {PAID_TO_DRIVER, HANDED_OVER_TO_OFFICE, PAID_ONLINE,
 * SETTLED, PAID} OR when the POS method was `SUBSCRIPTION_WALLET`.
 * Otherwise collected = 0 and the entire `totalPrice` lands as
 * debt. This is the legacy "gross sales / settlement-flag" view
 * that the report page has always used; it is INTENTIONALLY
 * distinct from the V20.4 canonical `remainingDebtKd` snapshot
 * surface (which is partial-payment-aware and lives behind the
 * Customer 360 / Outstanding endpoints).
 */

const SETTLED_CASH_STATUSES = new Set<CashStatus>([
  CashStatus.PAID_TO_DRIVER,
  CashStatus.HANDED_OVER_TO_OFFICE,
  CashStatus.PAID_ONLINE,
]);

const SUBSCRIPTION_WALLET_METHOD = 'SUBSCRIPTION_WALLET';

const NO_BRANCH_ID = 'no-branch';
const NO_BRANCH_LABEL = 'بدون فرع';
const NO_DRIVER_ID = 'no-driver';
const NO_DRIVER_LABEL = 'بدون سائق';

type GroupAccumulator = {
  id: string;
  name: string;
  totalSales: Prisma.Decimal;
  totalCollected: Prisma.Decimal;
  invoiceCount: number;
};

const DEC_ZERO = new Prisma.Decimal(0);

function bps(numerator: Prisma.Decimal, denominator: Prisma.Decimal): number {
  if (denominator.lessThanOrEqualTo(0)) return 0;
  // collectionRate × 10000, banker-rounded to integer basis points.
  const ratio = numerator.div(denominator).times(10000);
  return ratio
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_EVEN)
    .toNumber();
}

function debt(sales: Prisma.Decimal, collected: Prisma.Decimal): Prisma.Decimal {
  const diff = sales.minus(collected);
  return diff.lessThan(DEC_ZERO) ? DEC_ZERO : diff;
}

function dec4(value: Prisma.Decimal): string {
  return value.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_EVEN).toFixed(4);
}

function groupRow(acc: GroupAccumulator): SalesDebtAnalyticsGroupDto {
  return {
    id: acc.id,
    name: acc.name,
    totalSalesKd: dec4(acc.totalSales),
    totalCollectedKd: dec4(acc.totalCollected),
    totalDebtKd: dec4(debt(acc.totalSales, acc.totalCollected)),
    collectionRateBps: bps(acc.totalCollected, acc.totalSales),
    invoiceCount: acc.invoiceCount,
  };
}

function sortedGroups(map: Map<string, GroupAccumulator>): SalesDebtAnalyticsGroupDto[] {
  return [...map.values()]
    .sort((a, b) => (b.totalSales.greaterThan(a.totalSales) ? 1 : -1))
    .map(groupRow);
}

function addToGroup(
  map: Map<string, GroupAccumulator>,
  id: string,
  name: string,
  sales: Prisma.Decimal,
  collected: Prisma.Decimal,
): void {
  const current = map.get(id);
  if (current) {
    current.totalSales = current.totalSales.plus(sales);
    current.totalCollected = current.totalCollected.plus(collected);
    current.invoiceCount += 1;
    return;
  }
  map.set(id, {
    id,
    name,
    totalSales: sales,
    totalCollected: collected,
    invoiceCount: 1,
  });
}

function arabicPercent(bpsValue: number): string {
  return `${(bpsValue / 100).toFixed(0)}%`;
}

/**
 * خدمة تحليلات المبيعات والديون — تُجمّع بيانات المبيعات والتحصيل لكل فرع وسائق
 * Sales-debt analytics service aggregating per-branch and per-driver sales/collection totals
 * in canonical Prisma.Decimal arithmetic (V24 server-side replacement for FE reduce logic).
 * @since V24
 */
@Injectable()
export class SalesDebtAnalyticsService {
  private readonly logger = new Logger(SalesDebtAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * يُرجع تحليلات المبيعات والديون مُجمَّعة حسب الفرع والسائق مع الرؤى
   * Returns sales-debt analytics grouped by branch and driver with insights.
   * Computes collection rate, debt totals, and insight badges server-side.
   *
   * @param fromIso - تاريخ البداية بتنسيق ISO | Start date ISO string
   * @param toIso - تاريخ النهاية بتنسيق ISO | End date ISO string
   * @returns تحليلات المبيعات والديون مع الرؤى | Sales-debt analytics response with insights
   */
  async getAnalytics(
    fromIso: string,
    toIso: string,
  ): Promise<SalesDebtAnalyticsResponseDto> {
    const fromDate = new Date(fromIso);
    const toDate = new Date(toIso);
    const orders = await this.prisma.order.findMany({
      where: {
        status: { not: OrderStatus.CANCELED },
        OR: [
          { completedAt: { gte: fromDate, lte: toDate } },
          {
            AND: [
              { completedAt: null },
              { createdAt: { gte: fromDate, lte: toDate } },
            ],
          },
        ],
      },
      select: {
        id: true,
        totalPrice: true,
        cashStatus: true,
        posPaymentMethod: true,
        driver: {
          select: {
            id: true,
            fullName: true,
            username: true,
            branch: { select: { id: true, name: true } },
          },
        },
      },
    });

    const byBranch = new Map<string, GroupAccumulator>();
    const byDriver = new Map<string, GroupAccumulator>();
    let totalSales = DEC_ZERO;
    let totalCollected = DEC_ZERO;
    let invoiceCount = 0;

    for (const order of orders) {
      const sales = new Prisma.Decimal(order.totalPrice.toString());
      const settled =
        SETTLED_CASH_STATUSES.has(order.cashStatus) ||
        order.posPaymentMethod === SUBSCRIPTION_WALLET_METHOD;
      const collected = settled ? sales : DEC_ZERO;

      totalSales = totalSales.plus(sales);
      totalCollected = totalCollected.plus(collected);
      invoiceCount += 1;

      const branchId = order.driver?.branch?.id ?? NO_BRANCH_ID;
      const branchName = order.driver?.branch?.name ?? NO_BRANCH_LABEL;
      addToGroup(byBranch, branchId, branchName, sales, collected);

      const driverId = order.driver?.id ?? NO_DRIVER_ID;
      const driverLabel =
        order.driver?.fullName?.trim() ||
        order.driver?.username ||
        NO_DRIVER_LABEL;
      addToGroup(byDriver, driverId, driverLabel, sales, collected);
    }

    const totalDebt = debt(totalSales, totalCollected);
    const collectionRateBps = bps(totalCollected, totalSales);
    const branchGroups = sortedGroups(byBranch);
    const driverGroups = sortedGroups(byDriver);

    const insights = this.generateInsights(
      totalSales,
      totalCollected,
      totalDebt,
      collectionRateBps,
      invoiceCount,
      branchGroups,
      driverGroups,
    );

    return {
      source: 'api/finance/sales-debt-analytics',
      period: {
        fromIso: fromDate.toISOString(),
        toIso: toDate.toISOString(),
      },
      totals: {
        totalSalesKd: dec4(totalSales),
        totalCollectedKd: dec4(totalCollected),
        totalDebtKd: dec4(totalDebt),
        collectionRateBps,
        invoiceCount,
      },
      byBranch: branchGroups,
      byDriver: driverGroups,
      insights,
    };
  }

  /**
   * Mirrors the badge logic of `web/src/lib/sales-debt-insights.ts`
   * so the FE can render the V24 Authority response verbatim
   * without re-running any aggregation. All thresholds preserved
   * (collection-rate < 70%, debt-share > 40%, group concentration,
   * weak-collection performers).
   */
  private generateInsights(
    totalSales: Prisma.Decimal,
    _totalCollected: Prisma.Decimal,
    totalDebt: Prisma.Decimal,
    collectionRateBps: number,
    invoiceCount: number,
    byBranch: SalesDebtAnalyticsGroupDto[],
    byDriver: SalesDebtAnalyticsGroupDto[],
  ): SalesDebtInsightDto[] {
    if (invoiceCount === 0 || totalSales.lessThanOrEqualTo(0)) return [];

    const insights: SalesDebtInsightDto[] = [];
    const debtShareBps = bps(totalDebt, totalSales);

    if (collectionRateBps < 7000) {
      insights.push({
        id: 'low-collection',
        severity: collectionRateBps < 4500 ? 'critical' : 'warning',
        message: `⚠️ نسبة التحصيل منخفضة (${arabicPercent(collectionRateBps)})`,
      });
    }

    if (debtShareBps > 4000) {
      insights.push({
        id: 'high-debt',
        severity: debtShareBps > 6000 ? 'critical' : 'warning',
        message: '🚨 المديونية مرتفعة مقارنة بالمبيعات',
      });
    }

    const totalDebtForShare = new Prisma.Decimal(totalDebt.toString());

    const topBranch = highestDebtGroup(byBranch);
    if (topBranch) {
      const share = bps(
        new Prisma.Decimal(topBranch.totalDebtKd),
        totalDebtForShare.lessThanOrEqualTo(0) ? new Prisma.Decimal(1) : totalDebtForShare,
      );
      insights.push({
        id: 'top-risk-branch',
        severity: share > 5000 ? 'warning' : 'info',
        message: `🏢 أعلى فرع مديونية: ${topBranch.name}`,
        target: 'branch',
      });
    }

    const topDriver = highestDebtGroup(byDriver);
    if (topDriver) {
      const share = bps(
        new Prisma.Decimal(topDriver.totalDebtKd),
        totalDebtForShare.lessThanOrEqualTo(0) ? new Prisma.Decimal(1) : totalDebtForShare,
      );
      insights.push({
        id: 'top-risk-driver',
        severity: share > 5000 ? 'warning' : 'info',
        message: `🚗 أعلى سائق مديونية: ${topDriver.name}`,
        target: 'driver',
      });
    }

    const weakBranch = poorPerformerGroup(byBranch);
    if (weakBranch) {
      insights.push({
        id: `poor-branch-${weakBranch.id}`,
        severity: 'warning',
        message: `⚠️ أداء تحصيل ضعيف لدى ${weakBranch.name}`,
        target: 'branch',
      });
    }

    const weakDriver = poorPerformerGroup(byDriver);
    if (weakDriver) {
      insights.push({
        id: `poor-driver-${weakDriver.id}`,
        severity: 'warning',
        message: `⚠️ أداء تحصيل ضعيف لدى ${weakDriver.name}`,
        target: 'driver',
      });
    }

    if (insights.length === 0) {
      insights.push({
        id: 'healthy',
        severity: 'info',
        message: '✅ التحصيل مستقر ولا توجد مديونية عالية في الفترة الحالية',
      });
    }

    return insights.slice(0, 6);
  }
}

function highestDebtGroup(
  rows: SalesDebtAnalyticsGroupDto[],
): SalesDebtAnalyticsGroupDto | null {
  let best: SalesDebtAnalyticsGroupDto | null = null;
  for (const row of rows) {
    const debtDec = new Prisma.Decimal(row.totalDebtKd);
    if (debtDec.lessThanOrEqualTo(0)) continue;
    if (!best) {
      best = row;
      continue;
    }
    if (debtDec.greaterThan(new Prisma.Decimal(best.totalDebtKd))) {
      best = row;
    }
  }
  return best;
}

function poorPerformerGroup(
  rows: SalesDebtAnalyticsGroupDto[],
): SalesDebtAnalyticsGroupDto | null {
  // collectionRateBps < 5000 means < 50% collection rate
  const candidates = rows
    .filter((row) => {
      const sales = new Prisma.Decimal(row.totalSalesKd);
      return sales.greaterThan(0) && row.collectionRateBps < 5000;
    })
    .sort((a, b) => {
      const aD = new Prisma.Decimal(a.totalDebtKd);
      const bD = new Prisma.Decimal(b.totalDebtKd);
      return bD.greaterThan(aD) ? 1 : -1;
    });
  return candidates[0] ?? null;
}
