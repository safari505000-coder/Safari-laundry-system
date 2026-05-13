import { Injectable } from '@nestjs/common';
import {
  CashStatus,
  ExpenseCategory,
  ExpenseStatus,
  GeneralLedgerEntryType,
  ManagerCashCustodyStatus,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
} from '@prisma/client';
import {
  KUWAIT_OFFSET_MIN,
  kuwaitMidnightUtc,
  kuwaitDayIso,
} from '../../common/time/kuwait-time';
import { CUSTODY_OVERDUE_MS } from '../../manager-custody/manager-custody.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CashService } from './cash.service';
import {
  AccountantDashboardPeriod,
  AccountantDashboardQueryDto,
} from '../dto/accountant-dashboard-query.dto';
import { FinanceDashboardCacheService } from './finance-dashboard-cache.service';
import {
  kpiTrendDirection,
  reconciliationBadgeFromDiff,
  reconciliationDeltaKds,
} from '../utils/accountant-dashboard-math';

const DRIVER_DELAY_WARN_H = 24;
const DRIVER_DELAY_CRIT_H = 48;
const DEPOSIT_VERIFY_WARN_H = 48;
const EXPENSE_SPIKE_RATIO = 0.5;

function branchOnOrder(branchId?: string): Prisma.OrderWhereInput {
  if (!branchId) return {};
  return { driver: { branchId } };
}

function toKd(d: Prisma.Decimal | null | undefined): string {
  if (d === null || d === undefined) return '0.0000';
  return d.toFixed(4);
}

/**
 * يمثل النافذة الزمنية المحلولة للوحة معلومات المحاسب
 * Represents the resolved time window for the accountant dashboard,
 * including the current and previous period ISO ranges.
 */
export type ResolvedDashboardWindow = {
  period: AccountantDashboardPeriod;
  current: { fromIso: string; toIso: string };
  previous: { fromIso: string; toIso: string };
};

/**
 * خدمة لوحة معلومات المحاسب — تجمع مؤشرات الأداء المالية والتسويات والتنبيهات
 * Accountant dashboard service: aggregates KPIs (sales, cash, deposits, profit),
 * cash-pipeline stages, reconciliation status, and alert feeds.
 *
 * Every public endpoint delegates to a private `build*` method that is wrapped
 * in {@link FinanceDashboardCacheService} for short-TTL caching.
 */
@Injectable()
export class AccountantDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cashService: CashService,
    private readonly cache: FinanceDashboardCacheService,
  ) {}

  /**
   * يُحدد النوافذ الزمنية الحالية والسابقة بناءً على الفترة المطلوبة
   * Resolves the current and previous time windows for a dashboard period
   * (TODAY, WEEK, or MONTH) relative to the given reference timestamp.
   *
   * @param period - الفترة الزمنية المختارة | Dashboard period enum value
   * @param now - الوقت المرجعي (افتراضي: الآن) | Reference time (defaults to now)
   * @returns نافذتان زمنيتان: الحالية والسابقة | Current and previous date ranges
   */
  resolveWindow(
    period: AccountantDashboardPeriod,
    now = new Date(),
  ): {
    cur: { from: Date; to: Date };
    prev: { from: Date; to: Date };
  } {
    const to = now;
    const todayStart = kuwaitMidnightUtc(now);

    if (period === AccountantDashboardPeriod.TODAY) {
      return {
        cur: { from: todayStart, to },
        prev: {
          from: new Date(todayStart.getTime() - 24 * 60 * 60 * 1000),
          to: new Date(todayStart.getTime() - 1),
        },
      };
    }

    if (period === AccountantDashboardPeriod.WEEK) {
      const from = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
      const len = to.getTime() - from.getTime();
      const prevTo = new Date(from.getTime() - 1);
      const prevFrom = new Date(prevTo.getTime() - len);
      return {
        cur: { from, to },
        prev: { from: prevFrom, to: prevTo },
      };
    }

    const k = new Date(now.getTime() + KUWAIT_OFFSET_MIN * 60_000);
    const y = k.getUTCFullYear();
    const mo = k.getUTCMonth();
    const curFrom = new Date(
      Date.UTC(y, mo, 1, 0, 0, 0, 0) - KUWAIT_OFFSET_MIN * 60_000,
    );
    const prevMonthLast = new Date(curFrom.getTime() - 1);
    const pk = new Date(prevMonthLast.getTime() + KUWAIT_OFFSET_MIN * 60_000);
    const py = pk.getUTCFullYear();
    const pm = pk.getUTCMonth();
    const prevFrom = new Date(
      Date.UTC(py, pm, 1, 0, 0, 0, 0) - KUWAIT_OFFSET_MIN * 60_000,
    );
    return {
      cur: { from: curFrom, to },
      prev: { from: prevFrom, to: prevMonthLast },
    };
  }

  /**
   * يُرجع ملخص لوحة معلومات المحاسب مع مؤشرات الأداء الرئيسية والمخططات
   * Returns the full accountant dashboard summary including KPIs, cash pipeline,
   * expense insights, and daily time-series charts. Cached short-TTL.
   *
   * @param q - معايير استعلام اللوحة | Dashboard query parameters
   * @returns ملخص شامل للوحة المعلومات | Full dashboard summary
   */
  async getDashboardSummary(q: AccountantDashboardQueryDto) {
    const key = this.cache.cacheKey('summary', {
      period: q.period,
      branchId: q.branchId,
    });
    return this.cache.wrapJson(key, () => this.buildDashboardSummary(q));
  }

  private async buildDashboardSummary(q: AccountantDashboardQueryDto) {
    const { cur, prev } = this.resolveWindow(
      q.period ?? AccountantDashboardPeriod.TODAY,
    );
    const b = q.branchId;

    const [
      salesCur,
      salesPrev,
      cashCur,
      cashPrev,
      cashDriversKd,
      cashManagers,
      bankCur,
      bankPrev,
      glCur,
      glPrev,
      expenseBlock,
      series,
      drillManagers,
      drillDrivers,
    ] = await Promise.all([
      this.sumCompletedSales(cur.from, cur.to, b),
      this.sumCompletedSales(prev.from, prev.to, b),
      this.sumCashCollected(cur.from, cur.to, b),
      this.sumCashCollected(prev.from, prev.to, b),
      this.sumFieldCashKd(b),
      this.sumManagerCustodyOpenKd(b),
      this.sumVerifiedCustody(cur.from, cur.to, b),
      this.sumVerifiedCustody(prev.from, prev.to, b),
      this.glNet(cur.from, cur.to),
      this.glNet(prev.from, prev.to),
      this.expenseInsights(cur.from, cur.to, b),
      this.dailySeries(Math.min(14, Math.ceil((cur.to.getTime() - cur.from.getTime()) / 86400000) + 1 || 14), b),
      this.drilldownManagerBags(b, 80),
      this.drilldownPendingDrivers(b, 80),
    ]);

    const pipeline = await this.buildPipeline(cur.from, cur.to, b);

    const window: ResolvedDashboardWindow = {
      period: q.period ?? AccountantDashboardPeriod.TODAY,
      current: { fromIso: cur.from.toISOString(), toIso: cur.to.toISOString() },
      previous: { fromIso: prev.from.toISOString(), toIso: prev.to.toISOString() },
    };

    const kpi = (valueKd: string, prevKd: string, drill: string, count?: number) => {
      const t = kpiTrendDirection(Number(valueKd), Number(prevKd));
      return {
        valueKd,
        previousKd: prevKd,
        count,
        trendPctVsPrevious: t.pctVsPrevious,
        trendDirection: t.direction,
        drilldownType: drill,
      };
    };

    return {
      window,
      kpis: {
        totalSales: kpi(salesCur.kd, salesPrev.kd, 'completed_orders', salesCur.count),
        cashCollected: kpi(cashCur.kd, cashPrev.kd, 'cash_orders_completed', cashCur.count),
        cashWithDrivers: {
          valueKd: cashDriversKd,
          snapshot: true,
          trendPctVsPrevious: 0,
          trendDirection: 'flat' as const,
          drilldownType: 'pending_drivers',
        },
        cashWithManagers: {
          valueKd: cashManagers.kd,
          count: cashManagers.count,
          snapshot: true,
          trendPctVsPrevious: 0,
          trendDirection: 'flat' as const,
          drilldownType: 'open_custody_bags',
        },
        bankDeposited: kpi(bankCur.kd, bankPrev.kd, 'verified_custody_window', bankCur.count),
        netProfit: kpi(glCur.netKd, glPrev.netKd, 'general_ledger_net'),
      },
      pipeline,
      expenses: expenseBlock,
      charts: series,
      drilldowns: {
        openCustodyBags: drillManagers,
        pendingDrivers: drillDrivers,
      },
      cacheTtlSec:
        Number.parseInt(process.env.FINANCE_DASHBOARD_CACHE_TTL_SEC ?? '45', 10) || 45,
    };
  }

  /**
   * يُرجع تقرير تسوية النقدية للفترة الزمنية المحددة
   * Returns a cash reconciliation report comparing collected vs handed-in amounts
   * for the selected dashboard window. Cached short-TTL.
   *
   * @param q - معايير استعلام اللوحة | Dashboard query parameters
   * @returns تقرير التسوية مع الفوارق والشارات | Reconciliation report with diff and badge
   */
  async getReconciliation(q: AccountantDashboardQueryDto) {
    const key = this.cache.cacheKey('recon', {
      period: q.period,
      branchId: q.branchId,
    });
    return this.cache.wrapJson(key, () => this.buildReconciliation(q));
  }

  private async buildReconciliation(q: AccountantDashboardQueryDto) {
    const { cur } = this.resolveWindow(
      q.period ?? AccountantDashboardPeriod.TODAY,
    );
    const b = q.branchId;

    const [collected, handed, pendingDriversKd, pendingManagersKd] =
      await Promise.all([
        this.sumCashCollected(cur.from, cur.to, b),
        this.sumHandedInWindow(cur.from, cur.to, b),
        this.sumFieldCashKd(b),
        this.sumManagerDepositRejectedKd(b),
      ]);

    const c = Number(collected.kd);
    const h = Number(handed.kd);
    const diff = h - c;
    const differenceKd = diff.toFixed(4);
    const badge = reconciliationBadgeFromDiff(diff);
    const { deltaKd, shortfallKd, status } = reconciliationDeltaKds(c, h);

    return {
      window: {
        fromIso: cur.from.toISOString(),
        toIso: cur.to.toISOString(),
      },
      collected: { kd: collected.kd, orderCount: collected.count },
      handed: { kd: handed.kd, bagCount: handed.count },
      pendingDrivers: { kd: pendingDriversKd },
      pendingManagers: { kd: pendingManagersKd },
      differenceKd,
      deltaKd,
      shortfallKd,
      status,
      badge,
    };
  }

  /**
   * يُقدم تفسيراً مفصلاً لتسوية النقدية مع تفصيل حسب اليوم والسائق والمدير
   * Provides a detailed breakdown of the reconciliation by Kuwait day, driver, and manager
   * with narrative hints explaining timing gaps. Cached short-TTL.
   *
   * @param q - معايير استعلام اللوحة | Dashboard query parameters
   * @returns تفصيل التسوية مع الروايات التفسيرية | Detailed reconciliation with narratives
   */
  async explainReconciliation(q: AccountantDashboardQueryDto) {
    const key = this.cache.cacheKey('explain', {
      period: q.period,
      branchId: q.branchId,
    });
    return this.cache.wrapJson(key, () => this.buildExplain(q));
  }

  private async buildExplain(q: AccountantDashboardQueryDto) {
    const { cur } = this.resolveWindow(
      q.period ?? AccountantDashboardPeriod.TODAY,
    );
    const b = q.branchId;
    const orderBranch =
      b ?
        Prisma.sql`AND o."driverId" IN (SELECT id FROM "User" WHERE "branchId" = ${b}::uuid)`
      : Prisma.empty;
    const branchCustody = b ?
      Prisma.sql`AND c."branchId" = ${b}::uuid`
    : Prisma.empty;
    const branchDriver = b ?
      Prisma.sql`AND d."branchId" = ${b}::uuid`
    : Prisma.empty;

    const byDate = await this.reconciliationByKuwaitDay(cur.from, cur.to, b);
    const byDriver = await this.prisma.$queryRaw<
      { driverId: string; name: string; collectedKd: string; handedKd: string }[]
    >(Prisma.sql`
      SELECT d.id as "driverId",
             d."fullName" as name,
             COALESCE(o.s, 0)::text as "collectedKd",
             COALESCE(m.s, 0)::text as "handedKd"
      FROM "User" d
      LEFT JOIN (
        SELECT o."driverId", SUM(o."totalPrice")::decimal(19,4) as s
        FROM "Order" o
        WHERE o.status = 'COMPLETED'
          AND o."posPaymentMethod" = 'CASH'
          AND o."driverId" IS NOT NULL
          AND o."completedAt" >= ${cur.from}
          AND o."completedAt" <= ${cur.to}
          ${orderBranch}
        GROUP BY o."driverId"
      ) o ON o."driverId" = d.id
      LEFT JOIN (
        SELECT c."driverId", SUM(c."amountKd")::decimal(19,4) as s
        FROM "ManagerCashCustody" c
        WHERE c."receivedFromDriverAt" >= ${cur.from}
          AND c."receivedFromDriverAt" <= ${cur.to}
          ${branchCustody}
        GROUP BY c."driverId"
      ) m ON m."driverId" = d.id
      WHERE d."safariRole" = 'DRIVER'
        ${branchDriver}
        AND (COALESCE(o.s,0) > 0 OR COALESCE(m.s,0) > 0)
      ORDER BY d."fullName" ASC
      LIMIT 120
    `);

    const byManager = await this.prisma.$queryRaw<
      { managerId: string; name: string; handedKd: string; bagCount: bigint }[]
    >(Prisma.sql`
      SELECT u.id as "managerId",
             u."fullName" as name,
             SUM(c."amountKd")::decimal(19,4)::text as "handedKd",
             COUNT(*)::bigint as "bagCount"
      FROM "ManagerCashCustody" c
      JOIN "User" u ON u.id = c."managerId"
      WHERE c."receivedFromDriverAt" >= ${cur.from}
        AND c."receivedFromDriverAt" <= ${cur.to}
        ${branchCustody}
      GROUP BY u.id, u."fullName"
      ORDER BY SUM(c."amountKd") DESC
      LIMIT 80
    `);

    const narratives: string[] = [];
    const todayIso = kuwaitDayIso(new Date());
    const yesterdayIso = kuwaitDayIso(new Date(Date.now() - 86400000));
    const tCollected = byDate.find((r) => r.day === todayIso);
    const yCollected = byDate.find((r) => r.day === yesterdayIso);
    if (tCollected && yCollected && Number(tCollected.handedKd) > 0) {
      narratives.push(
        `Handed ${tCollected.handedKd} KWD in reports window includes portions from multi-day settlements; compare collected ${tCollected.collectedKd} vs handed ${tCollected.handedKd} for ${todayIso}.`,
      );
    }
    if (yCollected && tCollected && Number(tCollected.handedKd) > Number(yCollected.collectedKd)) {
      narratives.push(
        `Today's handovers (${tCollected.handedKd} KWD) may include cash from prior days' completed orders (timing lag between completedAt and receivedFromDriverAt).`,
      );
    }

    const [colAgg, hAgg] = await Promise.all([
      this.sumCashCollected(cur.from, cur.to, b),
      this.sumHandedInWindow(cur.from, cur.to, b),
    ]);
    const cTot = Number(colAgg.kd);
    const hTot = Number(hAgg.kd);
    const { deltaKd: totalDeltaKd, shortfallKd: totalShortfallKd, status } =
      reconciliationDeltaKds(cTot, hTot);
    const summaryLabels = {
      driverHoldsLine:
        status === 'RED' ? `Driver holds ${totalShortfallKd} KWD` : null,
      officeHoldsLine:
        status === 'YELLOW' ?
          `Office holds ${totalDeltaKd} KWD (pending reconciliation)`
        : null,
    };

    return {
      window: {
        fromIso: cur.from.toISOString(),
        toIso: cur.to.toISOString(),
      },
      byDate,
      byDriver: byDriver.map((r) => {
        const ck = Number(r.collectedKd).toFixed(4);
        const hk = Number(r.handedKd).toFixed(4);
        const sf = (Number(ck) - Number(hk)).toFixed(4);
        return {
          driverId: r.driverId,
          name: r.name,
          collectedKd: ck,
          handedKd: hk,
          shortfallKd: sf,
        };
      }),
      byManager: byManager.map((r) => ({
        managerId: r.managerId,
        name: r.name,
        handedKd: Number(r.handedKd).toFixed(4),
        bagCount: Number(r.bagCount),
      })),
      totalShortfallKd,
      totalDeltaKd,
      summaryLabels,
      narratives,
    };
  }

  /**
   * يُرجع قائمة التنبيهات المالية النشطة مصنفة حسب الأولوية
   * Returns active financial alerts sorted by severity: late driver cash,
   * rejected custody bags, and expense spikes. Cached short-TTL.
   *
   * @param q - معايير استعلام اللوحة | Dashboard query parameters
   * @returns قائمة التنبيهات مع الأولوية والتفاصيل | Alerts list with severity and detail
   */
  async getAlerts(q: AccountantDashboardQueryDto) {
    const key = this.cache.cacheKey('alerts', {
      period: q.period,
      branchId: q.branchId,
    });
    return this.cache.wrapJson(key, () => this.buildAlerts(q));
  }

  private async buildAlerts(q: AccountantDashboardQueryDto) {
    const b = q.branchId;
    const now = Date.now();
    const alerts: Array<{
      id: string;
      severity: 'HIGH' | 'MEDIUM' | 'LOW';
      code: string;
      title: string;
      detail: string;
      drilldownType: string;
      refId?: string;
    }> = [];

    const driverLate = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.COMPLETED,
        cashStatus: CashStatus.PAID_TO_DRIVER,
        posPaymentMethod: PosPaymentMethod.CASH,
        driverId: { not: null },
        completedAt: { not: null },
        ...branchOnOrder(b),
      },
      select: {
        driverId: true,
        completedAt: true,
        totalPrice: true,
        driver: { select: { fullName: true } },
      },
      orderBy: { completedAt: 'asc' },
      take: 400,
    });

    const worstByDriver = new Map<
      string,
      { hours: number; name: string; amountKd: string }
    >();
    for (const o of driverLate) {
      if (!o.driverId || !o.completedAt) continue;
      const h = (now - o.completedAt.getTime()) / 3600000;
      if (h < DRIVER_DELAY_WARN_H) continue;
      const prev = worstByDriver.get(o.driverId);
      const name = o.driver?.fullName ?? o.driverId;
      const kd = toKd(o.totalPrice);
      if (!prev || h > prev.hours) {
        worstByDriver.set(o.driverId, { hours: h, name, amountKd: kd });
      }
    }
    for (const [driverId, v] of worstByDriver) {
      alerts.push({
        id: `drv-late-${driverId}`,
        severity: v.hours >= DRIVER_DELAY_CRIT_H ? 'HIGH' : 'MEDIUM',
        code: 'DRIVER_CASH_AGING',
        title: 'Driver field cash aging',
        detail: `${v.name}: oldest unhanded ticket ~${Math.floor(v.hours)}h (${v.amountKd} KWD sample)`,
        drilldownType: 'pending_drivers',
        refId: driverId,
      });
    }

    const rejected = await this.prisma.managerCashCustody.findMany({
      where: { status: ManagerCashCustodyStatus.REJECTED },
      select: {
        id: true,
        amountKd: true,
        manager: { select: { fullName: true } },
      },
      take: 50,
    });
    for (const r of rejected) {
      alerts.push({
        id: `rej-${r.id}`,
        severity: 'HIGH',
        code: 'CUSTODY_REJECTED',
        title: 'Rejected custody bag',
        detail: `${r.manager.fullName}: ${toKd(r.amountKd)} KWD — needs re-upload / fix`,
        drilldownType: 'open_custody_bags',
        refId: r.id,
      });
    }

    const verifying = await this.prisma.managerCashCustody.findMany({
      where: { status: ManagerCashCustodyStatus.AWAITING_VERIFICATION },
      select: {
        id: true,
        amountKd: true,
        slipUploadedAt: true,
        manager: { select: { fullName: true } },
      },
      take: 100,
    });
    for (const v of verifying) {
      const t0 = v.slipUploadedAt?.getTime() ?? now;
      const w = (now - t0) / 3600000;
      if (w >= DEPOSIT_VERIFY_WARN_H) {
        alerts.push({
          id: `slip-${v.id}`,
          severity: 'MEDIUM',
          code: 'DEPOSIT_VERIFY_DELAY',
          title: 'Deposit slip awaiting verification',
          detail: `${v.manager.fullName}: ${toKd(v.amountKd)} KWD pending ${Math.floor(w)}h`,
          drilldownType: 'open_custody_bags',
          refId: v.id,
        });
      }
    }

    const { cur, prev } = this.resolveWindow(
      q.period ?? AccountantDashboardPeriod.WEEK,
    );
    const [expCur, expPrev] = await Promise.all([
      this.sumApprovedExpenses(cur.from, cur.to, b),
      this.sumApprovedExpenses(prev.from, prev.to, b),
    ]);
    const ec = Number(expCur);
    const ep = Number(expPrev);
    if (ep > 0 && ec / ep >= 1 + EXPENSE_SPIKE_RATIO) {
      alerts.push({
        id: 'exp-spike',
        severity: 'LOW',
        code: 'EXPENSE_SPIKE',
        title: 'Expense accrual up vs prior window',
        detail: `${expCur.toFixed(4)} KWD vs ${expPrev.toFixed(4)} KWD prior`,
        drilldownType: 'expense_reports',
      });
    }

    alerts.sort(
      (a, b) =>
        (a.severity === b.severity ? 0 : a.severity === 'HIGH' ? -1 : 1) ||
        a.code.localeCompare(b.code),
    );

    return { alerts, generatedAt: new Date().toISOString() };
  }

  /**
   * يُولّد رؤى مالية نصية استناداً إلى بيانات الفترة المحددة
   * Generates natural-language financial insight lines (profit trends, expense ratios,
   * reconciliation status, oldest unhanded cash) for the selected period.
   *
   * @param q - معايير استعلام اللوحة | Dashboard query parameters
   * @returns قائمة رؤى نصية وتوقيت توليدها | Array of insight strings and generatedAt timestamp
   */
  async getInsights(q: AccountantDashboardQueryDto) {
    const key = this.cache.cacheKey('insights', {
      period: q.period,
      branchId: q.branchId,
    });
    return this.cache.wrapJson(key, async () => {
      const { cur, prev } = this.resolveWindow(
        q.period ?? AccountantDashboardPeriod.MONTH,
      );
      const b = q.branchId;
      const [glC, glP, salesC, salesP, expB, recon] = await Promise.all([
        this.glNet(cur.from, cur.to),
        this.glNet(prev.from, prev.to),
        this.sumCompletedSales(cur.from, cur.to, b),
        this.sumCompletedSales(prev.from, prev.to, b),
        this.expenseInsights(cur.from, cur.to, b),
        this.buildReconciliation(q),
      ]);

      const lines: string[] = [];
      const nC = Number(glC.netKd);
      const nP = Number(glP.netKd);
      if (nP !== 0) {
        const p = ((nC - nP) / Math.abs(nP)) * 100;
        if (Math.abs(p) >= 5) {
          lines.push(
            p < 0 ?
              `Net book profit down ~${Math.abs(Math.round(p))}% vs prior window (sales ${glC.salesKd}, expenses ${glC.expensesSignedKd}).`
            : `Net book profit up ~${Math.round(p)}% vs prior window.`,
          );
        }
      }
      const expenseRatio =
        Number(salesC.kd) > 0 ?
          Number(expB.totalKd) / Number(salesC.kd)
        : 0;
      if (expenseRatio > 0.35) {
        lines.push(
          `Expense ratio ${(expenseRatio * 100).toFixed(1)}% of sales — category ${expB.topCategory ?? 'N/A'} leads.`,
        );
      }
      if (recon.status === 'YELLOW') {
        lines.push(
          `Office holds ${recon.deltaKd} KWD ahead of collections in-window (timing / reconciliation) — collected ${recon.collected.kd} vs handed ${recon.handed.kd}.`,
        );
      }
      if (recon.status === 'RED') {
        lines.push(
          `Drivers currently hold ${recon.shortfallKd} KWD not yet fully handed in-window (collected ${recon.collected.kd} vs handed ${recon.handed.kd}).`,
        );
      }

      const lateDriver = await this.prisma.order.findFirst({
        where: {
          status: OrderStatus.COMPLETED,
          cashStatus: CashStatus.PAID_TO_DRIVER,
          posPaymentMethod: PosPaymentMethod.CASH,
          completedAt: { not: null },
          ...branchOnOrder(b),
        },
        orderBy: { completedAt: 'asc' },
        select: {
          driver: { select: { fullName: true } },
          completedAt: true,
        },
      });
      if (lateDriver?.completedAt) {
        const hrs = (Date.now() - lateDriver.completedAt.getTime()) / 3600000;
        if (hrs >= DRIVER_DELAY_WARN_H) {
          lines.push(
            `Oldest unhanded cash: ${lateDriver.driver?.fullName ?? 'driver'} (~${Math.floor(hrs)}h since completion).`,
          );
        }
      }

      return { lines, generatedAt: new Date().toISOString() };
    });
  }

  // ─── helpers ───────────────────────────────────────────────────────

  private async sumCompletedSales(
    from: Date,
    to: Date,
    branchId?: string,
  ): Promise<{ kd: string; count: number }> {
    const where: Prisma.OrderWhereInput = {
      status: OrderStatus.COMPLETED,
      completedAt: { gte: from, lte: to },
      ...branchOnOrder(branchId),
    };
    const [agg, count] = await Promise.all([
      this.prisma.order.aggregate({
        where,
        _sum: { totalPrice: true },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { kd: toKd(agg._sum.totalPrice), count };
  }

  private async sumCashCollected(
    from: Date,
    to: Date,
    branchId?: string,
  ): Promise<{ kd: string; count: number }> {
    const where: Prisma.OrderWhereInput = {
      status: OrderStatus.COMPLETED,
      posPaymentMethod: PosPaymentMethod.CASH,
      /** Attributed field cash only — orphan rows without a driver skew reconciliation. */
      driverId: { not: null },
      completedAt: { gte: from, lte: to },
      ...branchOnOrder(branchId),
    };
    const [agg, count] = await Promise.all([
      this.prisma.order.aggregate({
        where,
        _sum: { totalPrice: true },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { kd: toKd(agg._sum.totalPrice), count };
  }

  private async sumHandedInWindow(
    from: Date,
    to: Date,
    branchId?: string,
  ): Promise<{ kd: string; count: number }> {
    const where: Prisma.ManagerCashCustodyWhereInput = {
      receivedFromDriverAt: { gte: from, lte: to },
      ...(branchId ? { branchId } : {}),
    };
    const [agg, count] = await Promise.all([
      this.prisma.managerCashCustody.aggregate({
        where,
        _sum: { amountKd: true },
      }),
      this.prisma.managerCashCustody.count({ where }),
    ]);
    return { kd: toKd(agg._sum.amountKd), count };
  }

  private async sumFieldCashKd(branchId?: string): Promise<string> {
    if (!branchId) {
      return this.cashService.getTotalCashWithDrivers();
    }
    const rows = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.COMPLETED,
        cashStatus: CashStatus.PAID_TO_DRIVER,
        posPaymentMethod: PosPaymentMethod.CASH,
        driver: { branchId },
      },
      select: { totalPrice: true },
    });
    const sum = rows.reduce(
      (a, r) => a + Number(r.totalPrice?.toString() ?? 0),
      0,
    );
    return sum.toFixed(4);
  }

  private async sumManagerCustodyOpenKd(
    branchId?: string,
  ): Promise<{ kd: string; count: number }> {
    const where: Prisma.ManagerCashCustodyWhereInput = {
      status: {
        in: [
          ManagerCashCustodyStatus.PENDING_DEPOSIT,
          ManagerCashCustodyStatus.AWAITING_VERIFICATION,
          ManagerCashCustodyStatus.REJECTED,
        ],
      },
      ...(branchId ? { branchId } : {}),
    };
    const [agg, count] = await Promise.all([
      this.prisma.managerCashCustody.aggregate({
        where,
        _sum: { amountKd: true },
      }),
      this.prisma.managerCashCustody.count({ where }),
    ]);
    return { kd: toKd(agg._sum.amountKd), count };
  }

  private async sumManagerDepositRejectedKd(
    branchId?: string,
  ): Promise<string> {
    const where: Prisma.ManagerCashCustodyWhereInput = {
      status: {
        in: [
          ManagerCashCustodyStatus.PENDING_DEPOSIT,
          ManagerCashCustodyStatus.REJECTED,
        ],
      },
      ...(branchId ? { branchId } : {}),
    };
    const agg = await this.prisma.managerCashCustody.aggregate({
      where,
      _sum: { amountKd: true },
    });
    return toKd(agg._sum.amountKd);
  }

  private async sumVerifiedCustody(
    from: Date,
    to: Date,
    branchId?: string,
  ): Promise<{ kd: string; count: number }> {
    const where: Prisma.ManagerCashCustodyWhereInput = {
      status: ManagerCashCustodyStatus.VERIFIED,
      verifiedAt: { gte: from, lte: to },
      ...(branchId ? { branchId } : {}),
    };
    const [agg, count] = await Promise.all([
      this.prisma.managerCashCustody.aggregate({
        where,
        _sum: { amountKd: true },
      }),
      this.prisma.managerCashCustody.count({ where }),
    ]);
    return { kd: toKd(agg._sum.amountKd), count };
  }

  private async glNet(
    from: Date,
    to: Date,
  ): Promise<{
    salesKd: string;
    expensesSignedKd: string;
    netKd: string;
  }> {
    const rows = await this.prisma.generalLedgerEntry.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        entryType: {
          in: [
            GeneralLedgerEntryType.POS_SALE_COMPLETED,
            GeneralLedgerEntryType.EXPENSE_RECORDED,
          ],
        },
      },
      select: { entryType: true, amount: true },
    });
    let sales = 0;
    let exp = 0;
    for (const r of rows) {
      const n = Number(r.amount.toString());
      if (r.entryType === GeneralLedgerEntryType.POS_SALE_COMPLETED) {
        sales += n;
      } else {
        exp += n;
      }
    }
    const net = sales - exp;
    return {
      salesKd: sales.toFixed(4),
      expensesSignedKd: exp.toFixed(4),
      netKd: net.toFixed(4),
    };
  }

  private async sumApprovedExpenses(
    from: Date,
    to: Date,
    branchId?: string,
  ): Promise<number> {
    const agg = await this.prisma.branchExpense.aggregate({
      where: {
        status: { in: [ExpenseStatus.APPROVED, ExpenseStatus.AUDIT] },
        expenseDate: { gte: from, lte: to },
        ...(branchId ? { branchId } : {}),
      },
      _sum: { amount: true },
    });
    return Number(agg._sum.amount?.toString() ?? 0);
  }

  private async expenseInsights(
    from: Date,
    to: Date,
    branchId?: string,
  ): Promise<{
    totalKd: string;
    topCategory: ExpenseCategory | null;
    expenseRatioVsSales: string | null;
  }> {
    const where: Prisma.BranchExpenseWhereInput = {
      status: { in: [ExpenseStatus.APPROVED, ExpenseStatus.AUDIT] },
      expenseDate: { gte: from, lte: to },
      ...(branchId ? { branchId } : {}),
    };
    const [rows, totalAgg, salesAgg] = await Promise.all([
      this.prisma.branchExpense.groupBy({
        by: ['category'],
        where,
        _sum: { amount: true },
      }),
      this.prisma.branchExpense.aggregate({
        where,
        _sum: { amount: true },
      }),
      this.prisma.order.aggregate({
        where: {
          status: OrderStatus.COMPLETED,
          completedAt: { gte: from, lte: to },
          ...branchOnOrder(branchId),
        },
        _sum: { totalPrice: true },
      }),
    ]);
    let top: ExpenseCategory | null = null;
    let topV = 0;
    for (const r of rows) {
      const v = Number(r._sum.amount?.toString() ?? 0);
      if (v > topV) {
        topV = v;
        top = r.category;
      }
    }
    const totalKd = toKd(totalAgg._sum.amount);
    const sales = Number(salesAgg._sum.totalPrice?.toString() ?? 0);
    const ratio =
      sales > 0 ? (Number(totalKd) / sales).toFixed(4) : null;
    return { totalKd, topCategory: top, expenseRatioVsSales: ratio };
  }

  private async dailySeries(maxDays: number, branchId?: string) {
    const days = Math.min(14, Math.max(3, maxDays));
    const to = new Date();
    const from = new Date(to.getTime() - (days - 1) * 86400000);
    const keys: string[] = [];
    for (let i = 0; i < days; i++) {
      keys.push(kuwaitDayIso(new Date(from.getTime() + i * 86400000)));
    }
    const profitPts: { day: string; netKd: string }[] = [];
    const salesExp: { day: string; salesKd: string; expensesKd: string }[] = [];
    const pipePts: { day: string; collectedKd: string; handedKd: string }[] = [];

    for (const dayIso of keys) {
      const dayStart = new Date(
        Date.parse(`${dayIso}T00:00:00.000Z`) -
          KUWAIT_OFFSET_MIN * 60_000,
      );
      const dayEnd = new Date(dayStart.getTime() + 86400000 - 1);
      const [gl, sales, expNum, cCol, hW] = await Promise.all([
        this.glNet(dayStart, dayEnd),
        this.sumCompletedSales(dayStart, dayEnd, branchId),
        this.sumApprovedExpenses(dayStart, dayEnd, branchId),
        this.sumCashCollected(dayStart, dayEnd, branchId),
        this.sumHandedInWindow(dayStart, dayEnd, branchId),
      ]);
      profitPts.push({ day: dayIso, netKd: gl.netKd });
      salesExp.push({
        day: dayIso,
        salesKd: sales.kd,
        expensesKd: expNum.toFixed(4),
      });
      pipePts.push({
        day: dayIso,
        collectedKd: cCol.kd,
        handedKd: hW.kd,
      });
    }

    return {
      profitOverTime: profitPts,
      salesVsExpenses: salesExp,
      cashStagesTrend: pipePts,
    };
  }

  private async buildPipeline(from: Date, to: Date, branchId?: string) {
    const orderWhere: Prisma.OrderWhereInput = {
      status: OrderStatus.COMPLETED,
      completedAt: { gte: from, lte: to },
      ...branchOnOrder(branchId),
    };
    const [
      salesAgg,
      salesCnt,
      cashPaidDriverRows,
      custodyOpen,
      custodyVerified,
      mgrOpen,
      bankSum,
      drvFieldKd,
      driversWithCashCnt,
    ] = await Promise.all([
        this.prisma.order.aggregate({
          where: orderWhere,
          _sum: { totalPrice: true },
        }),
        this.prisma.order.count({ where: orderWhere }),
        this.prisma.order.findMany({
          where: {
            status: OrderStatus.COMPLETED,
            cashStatus: CashStatus.PAID_TO_DRIVER,
            posPaymentMethod: PosPaymentMethod.CASH,
            completedAt: { not: null, lte: to },
            ...branchOnOrder(branchId),
          },
          select: { completedAt: true },
          take: 500,
        }),
        this.prisma.managerCashCustody.findMany({
          where: {
            status: {
              in: [
                ManagerCashCustodyStatus.PENDING_DEPOSIT,
                ManagerCashCustodyStatus.AWAITING_VERIFICATION,
                ManagerCashCustodyStatus.REJECTED,
              ],
            },
            ...(branchId ? { branchId } : {}),
          },
          select: { receivedFromDriverAt: true },
          take: 500,
        }),
        this.prisma.managerCashCustody.findMany({
          where: {
            status: ManagerCashCustodyStatus.VERIFIED,
            verifiedAt: { gte: from, lte: to },
            ...(branchId ? { branchId } : {}),
          },
          select: {
            receivedFromDriverAt: true,
            verifiedAt: true,
          },
          take: 500,
        }),
        this.sumManagerCustodyOpenKd(branchId),
        this.sumVerifiedCustody(from, to, branchId),
        this.sumFieldCashKd(branchId),
        this.prisma.order.groupBy({
          by: ['driverId'],
          where: {
            status: OrderStatus.COMPLETED,
            cashStatus: CashStatus.PAID_TO_DRIVER,
            posPaymentMethod: PosPaymentMethod.CASH,
            driverId: { not: null },
            ...branchOnOrder(branchId),
          },
        }).then((g) => g.length),
      ]);

    const now = Date.now();
    const drvDelays = cashPaidDriverRows
      .filter((r): r is typeof r & { completedAt: Date } => r.completedAt !== null)
      .map((r) => (now - r.completedAt.getTime()) / 3600000);
    const mgrDelays = custodyOpen.map(
      (r) => (now - r.receivedFromDriverAt.getTime()) / 3600000,
    );
    const bankDelays = custodyVerified.map(
      (r) =>
        (r.verifiedAt!.getTime() - r.receivedFromDriverAt.getTime()) / 3600000,
    );

    const tone = (avgH: number, crit: number, warn: number) => {
      if (avgH >= crit) return 'red';
      if (avgH >= warn) return 'yellow';
      return 'green';
    };

    const avg = (xs: number[]) =>
      xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

    return {
      stages: [
        {
          key: 'customer',
          label: 'Customer',
          amountKd: toKd(salesAgg._sum.totalPrice),
          count: salesCnt,
          avgDelayHours: 0,
          tone: 'green' as const,
        },
        {
          key: 'driver',
          label: 'Driver (field cash)',
          amountKd: drvFieldKd,
          count: driversWithCashCnt,
          avgDelayHours: Math.round(avg(drvDelays) * 10) / 10,
          tone: tone(avg(drvDelays), DRIVER_DELAY_CRIT_H, DRIVER_DELAY_WARN_H) as
            | 'green'
            | 'yellow'
            | 'red',
        },
        {
          key: 'manager',
          label: 'Manager custody',
          amountKd: mgrOpen.kd,
          count: mgrOpen.count,
          avgDelayHours: Math.round(avg(mgrDelays) * 10) / 10,
          tone: tone(avg(mgrDelays), 36, 24) as 'green' | 'yellow' | 'red',
        },
        {
          key: 'bank',
          label: 'Bank (verified)',
          amountKd: bankSum.kd,
          count: bankSum.count,
          avgDelayHours: Math.round(avg(bankDelays) * 10) / 10,
          tone: (avg(bankDelays) > 72 ? 'yellow' : 'green') as
            | 'green'
            | 'yellow'
            | 'red',
        },
      ],
    };
  }

  private async drilldownManagerBags(branchId?: string, take = 50) {
    return this.prisma.managerCashCustody.findMany({
      where: {
        status: {
          in: [
            ManagerCashCustodyStatus.PENDING_DEPOSIT,
            ManagerCashCustodyStatus.AWAITING_VERIFICATION,
            ManagerCashCustodyStatus.REJECTED,
          ],
        },
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { receivedFromDriverAt: 'asc' },
      take,
      select: {
        id: true,
        amountKd: true,
        status: true,
        receivedFromDriverAt: true,
        manager: { select: { id: true, fullName: true } },
        driver: { select: { id: true, fullName: true } },
      },
    }).then((rows) =>
      rows.map((r) => {
        const ageH = Math.max(
          0,
          (Date.now() - r.receivedFromDriverAt.getTime()) / 3600000,
        );
        return {
          id: r.id,
          amountKd: r.amountKd.toFixed(4),
          status: r.status,
          managerName: r.manager.fullName,
          driverName: r.driver.fullName,
          ageHours: Math.floor(ageH),
          isOverdue: ageH * 3600000 >= CUSTODY_OVERDUE_MS,
        };
      }),
    );
  }

  private async drilldownPendingDrivers(branchId?: string, take = 50) {
    const rows = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.COMPLETED,
        cashStatus: CashStatus.PAID_TO_DRIVER,
        posPaymentMethod: PosPaymentMethod.CASH,
        driverId: { not: null },
        completedAt: { not: null },
        ...branchOnOrder(branchId),
      },
      orderBy: { completedAt: 'asc' },
      take,
      select: {
        driverId: true,
        totalPrice: true,
        completedAt: true,
        driver: { select: { fullName: true, username: true } },
      },
    });

    const byDriver = new Map<
      string,
      { name: string; pendingKd: number; lastDelivery: Date }
    >();
    for (const r of rows) {
      if (!r.driverId || !r.completedAt) continue;
      const acc = byDriver.get(r.driverId) ?? {
        name: r.driver?.fullName ?? r.driverId,
        pendingKd: 0,
        lastDelivery: r.completedAt,
      };
      acc.pendingKd += Number(r.totalPrice.toString());
      if (r.completedAt > acc.lastDelivery) {
        acc.lastDelivery = r.completedAt;
      }
      byDriver.set(r.driverId, acc);
    }

    return [...byDriver.entries()].map(([driverId, v]) => ({
      driverId,
      name: v.name,
      pendingKd: v.pendingKd.toFixed(4),
      lastCompletedAt: v.lastDelivery.toISOString(),
    }));
  }

  private async reconciliationByKuwaitDay(
    from: Date,
    to: Date,
    branchId?: string,
  ): Promise<
    { day: string; collectedKd: string; handedKd: string }[]
  > {
    const out: { day: string; collectedKd: string; handedKd: string }[] = [];
    let t = kuwaitMidnightUtc(from);
    const end = to.getTime();
    while (t.getTime() <= end) {
      const dayIso = kuwaitDayIso(t);
      const next = new Date(t.getTime() + 86400000);
      const c = await this.sumCashCollected(t, new Date(next.getTime() - 1), branchId);
      const h = await this.sumHandedInWindow(t, new Date(next.getTime() - 1), branchId);
      out.push({
        day: dayIso,
        collectedKd: c.kd,
        handedKd: h.kd,
      });
      t = next;
    }
    return out;
  }
}
