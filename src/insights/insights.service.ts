import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Stage-C — AI / BI insights layer.
 *
 * This is an intentionally lightweight, dependency-free analytics
 * engine. We deliberately avoid pulling in a full ML library because:
 *
 *   1. The scale (orders per day) is small — the forecast and anomaly
 *      math fit in a couple of loops.
 *   2. The domain is well-understood (weekly seasonality, daily
 *      aggregates), so Moving-Average + Day-of-Week smoothing and a
 *      Z-score outlier rule deliver useful early-warning value without
 *      the operational burden of a training pipeline.
 *   3. All heavy lifting is pure functions on numeric arrays, which
 *      keeps the service easy to unit-test and reason about.
 *
 * Every method returns plain JSON shaped for direct consumption by the
 * Stage-C dashboard. Every number is returned as a string-safe number
 * (rounded to KD millis) so the frontend never has to re-parse
 * Prisma.Decimal on the wire.
 */
@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Cash flow forecast ───────────────────────────────────────────

  /**
   * Build a daily revenue / expense / net-cash series for the last
   * `lookbackDays`, then project the next `horizonDays` using a
   * moving-average baseline adjusted for day-of-week seasonality.
   *
   * Output points are aligned to local-Kuwait calendar days so the
   * frontend can render them on a single x-axis.
   */
  async cashForecast(lookbackDays = 60, horizonDays = 30) {
    const today = startOfKuwaitDay(new Date());
    const from = addDays(today, -lookbackDays);
    const to = addDays(today, 1); // exclusive upper-bound

    const [orders, expenses] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          completedAt: { gte: from, lt: to },
          status: OrderStatus.COMPLETED,
        },
        select: { completedAt: true, totalPrice: true },
      }),
      this.prisma.branchExpense.findMany({
        where: { expenseDate: { gte: from, lt: to } },
        select: { expenseDate: true, amount: true },
      }),
    ]);

    const revenueByDay = emptyDailyBucket(from, to);
    for (const o of orders) {
      if (!o.completedAt) continue;
      const key = kuwaitDayKey(o.completedAt);
      if (key in revenueByDay) {
        revenueByDay[key] += Number(o.totalPrice);
      }
    }

    const expenseByDay = emptyDailyBucket(from, to);
    for (const e of expenses) {
      const key = kuwaitDayKey(e.expenseDate);
      if (key in expenseByDay) {
        expenseByDay[key] += Number(e.amount);
      }
    }

    const historical = Object.keys(revenueByDay)
      .sort()
      .map((day) => {
        const revenue = revenueByDay[day];
        const expense = expenseByDay[day];
        return {
          date: day,
          revenue: round3(revenue),
          expense: round3(expense),
          netCash: round3(revenue - expense),
        };
      });

    const forecast = this.projectDaily(historical, horizonDays);

    return {
      windowDays: lookbackDays,
      horizonDays,
      historical,
      forecast,
      summary: {
        avgDailyRevenue: round3(avg(historical.map((p) => p.revenue))),
        avgDailyExpense: round3(avg(historical.map((p) => p.expense))),
        avgDailyNet: round3(avg(historical.map((p) => p.netCash))),
        forecastTotalRevenue: round3(sum(forecast.map((p) => p.revenue))),
        forecastTotalExpense: round3(sum(forecast.map((p) => p.expense))),
        forecastTotalNet: round3(sum(forecast.map((p) => p.netCash))),
      },
    };
  }

  /**
   * Moving-average + day-of-week seasonality projection. For each
   * future day we use:
   *
   *     base = mean(historical revenue)
   *     dowFactor = mean(revenue on same weekday) / base
   *     forecast = base * dowFactor
   *
   * If either mean is zero we fall back to a flat baseline. Expenses
   * follow the same model independently so the net-cash output is
   * coherent even when the two flows diverge.
   */
  private projectDaily(
    historical: Array<{ date: string; revenue: number; expense: number }>,
    horizonDays: number,
  ) {
    if (historical.length === 0 || horizonDays <= 0) return [];

    const revBase = avg(historical.map((p) => p.revenue));
    const expBase = avg(historical.map((p) => p.expense));
    const revDow = dayOfWeekFactor(historical, 'revenue', revBase);
    const expDow = dayOfWeekFactor(historical, 'expense', expBase);

    const lastDayKey = historical[historical.length - 1].date;
    const lastDay = parseKuwaitDayKey(lastDayKey);

    const out: Array<{
      date: string;
      revenue: number;
      expense: number;
      netCash: number;
    }> = [];
    for (let i = 1; i <= horizonDays; i += 1) {
      const day = addDays(lastDay, i);
      const dow = day.getUTCDay();
      const revenue = revBase * (revDow[dow] ?? 1);
      const expense = expBase * (expDow[dow] ?? 1);
      out.push({
        date: kuwaitDayKey(day),
        revenue: round3(revenue),
        expense: round3(expense),
        netCash: round3(revenue - expense),
      });
    }
    return out;
  }

  // ─── Anomaly detection ────────────────────────────────────────────

  /**
   * Flag daily revenue / expense buckets that fall outside ±`zThreshold`
   * standard deviations of the window mean. Z-score is a blunt-but-fair
   * baseline for early-warning alerts: it surfaces the day the business
   * "felt weird" without any training data or model-management overhead.
   */
  async detectAnomalies(windowDays = 30, zThreshold = 2) {
    const today = startOfKuwaitDay(new Date());
    const from = addDays(today, -windowDays);
    const to = addDays(today, 1);

    const [orders, expenses] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['completedAt'],
        where: {
          completedAt: { gte: from, lt: to },
          status: OrderStatus.COMPLETED,
        },
        _sum: { totalPrice: true },
        _count: { _all: true },
      }),
      this.prisma.branchExpense.groupBy({
        by: ['expenseDate'],
        where: { expenseDate: { gte: from, lt: to } },
        _sum: { amount: true },
      }),
    ]);

    const revenueByDay = emptyDailyBucket(from, to);
    const countByDay: Record<string, number> = {};
    for (const key of Object.keys(revenueByDay)) countByDay[key] = 0;

    for (const o of orders) {
      if (!o.completedAt) continue;
      const key = kuwaitDayKey(o.completedAt);
      if (key in revenueByDay) {
        revenueByDay[key] += Number(o._sum.totalPrice ?? 0);
        countByDay[key] += o._count._all;
      }
    }

    const expenseByDay = emptyDailyBucket(from, to);
    for (const e of expenses) {
      const key = kuwaitDayKey(e.expenseDate);
      if (key in expenseByDay) {
        expenseByDay[key] += Number(e._sum.amount ?? 0);
      }
    }

    const revSeries = Object.keys(revenueByDay)
      .sort()
      .map((date) => ({ date, value: revenueByDay[date] }));
    const expSeries = Object.keys(expenseByDay)
      .sort()
      .map((date) => ({ date, value: expenseByDay[date] }));

    const revFlags = flagAnomalies(revSeries, zThreshold);
    const expFlags = flagAnomalies(expSeries, zThreshold);

    return {
      windowDays,
      zThreshold,
      revenue: {
        series: revSeries.map((p) => ({
          date: p.date,
          value: round3(p.value),
          orders: countByDay[p.date] ?? 0,
        })),
        anomalies: revFlags,
      },
      expense: {
        series: expSeries.map((p) => ({
          date: p.date,
          value: round3(p.value),
        })),
        anomalies: expFlags,
      },
    };
  }

  // ─── Driver scorecard ─────────────────────────────────────────────

  /**
   * Composite driver KPI leaderboard. Three signals, each min-max
   * normalised to 0–100 and weighted, sum to a single 0–100 score:
   *
   *   - 40% completed trips (volume proxy)
   *   - 30% revenue per trip (quality proxy)
   *   - 30% inverse average turnaround hours (speed proxy)
   *
   * Normalisation is confined to the active cohort for the period, so
   * a single runaway-good driver doesn't compress the leaderboard.
   */
  async driverScorecard(periodDays = 30) {
    const today = startOfKuwaitDay(new Date());
    const from = addDays(today, -periodDays);
    const to = addDays(today, 1);

    const groups = await this.prisma.order.groupBy({
      by: ['driverId'],
      where: {
        completedAt: { gte: from, lt: to },
        status: OrderStatus.COMPLETED,
        driverId: { not: null },
      },
      _count: { _all: true },
      _sum: { totalPrice: true },
    });
    if (groups.length === 0) {
      return { periodDays, drivers: [] };
    }

    const driverIds = groups
      .map((g) => g.driverId)
      .filter((v): v is string => v != null);

    const driverBranchFlags = await this.prisma.user.findMany({
      where: { id: { in: driverIds } },
      select: { id: true, branch: { select: { isAdministrative: true } } },
    });
    const opsDriverIds = new Set(
      driverBranchFlags
        .filter((u) => !u.branch?.isAdministrative)
        .map((u) => u.id),
    );
    const filteredGroups = groups.filter(
      (g) => g.driverId != null && opsDriverIds.has(g.driverId as string),
    );
    if (filteredGroups.length === 0) {
      return { periodDays, drivers: [] };
    }

    // For turnaround we need the per-order create→complete delta. The
    // dataset stays small (one period per driver) so we just
    // stream-process in-memory.
    const opsIdList = [...opsDriverIds];
    const orders = await this.prisma.order.findMany({
      where: {
        completedAt: { gte: from, lt: to },
        status: OrderStatus.COMPLETED,
        driverId: { in: opsIdList },
      },
      select: {
        driverId: true,
        createdAt: true,
        completedAt: true,
      },
    });
    const turnaroundSumByDriver: Record<string, number> = {};
    const turnaroundNByDriver: Record<string, number> = {};
    for (const o of orders) {
      if (!o.driverId || !o.completedAt) continue;
      const hrs =
        (o.completedAt.getTime() - o.createdAt.getTime()) / (1000 * 60 * 60);
      if (!Number.isFinite(hrs) || hrs < 0) continue;
      turnaroundSumByDriver[o.driverId] =
        (turnaroundSumByDriver[o.driverId] ?? 0) + hrs;
      turnaroundNByDriver[o.driverId] =
        (turnaroundNByDriver[o.driverId] ?? 0) + 1;
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: opsIdList } },
      select: {
        id: true,
        fullName: true,
        username: true,
        branchId: true,
        branch: { select: { name: true } },
      },
    });
    const userIndex = new Map(users.map((u) => [u.id, u]));

    const raw = filteredGroups
      .filter((g) => g.driverId)
      .map((g) => {
        const id = g.driverId as string;
        const trips = g._count._all;
        const revenue = Number(g._sum.totalPrice ?? 0);
        const revPerTrip = trips > 0 ? revenue / trips : 0;
        const tSum = turnaroundSumByDriver[id] ?? 0;
        const tN = turnaroundNByDriver[id] ?? 0;
        const avgTurnaroundHrs = tN > 0 ? tSum / tN : 0;
        const u = userIndex.get(id);
        return {
          driverId: id,
          fullName: u?.fullName ?? u?.username ?? id.slice(0, 8),
          branchName: u?.branch?.name ?? null,
          trips,
          revenueKd: round3(revenue),
          revenuePerTripKd: round3(revPerTrip),
          avgTurnaroundHours: round2(avgTurnaroundHrs),
        };
      });

    const tripsMin = Math.min(...raw.map((r) => r.trips));
    const tripsMax = Math.max(...raw.map((r) => r.trips));
    const rptMin = Math.min(...raw.map((r) => r.revenuePerTripKd));
    const rptMax = Math.max(...raw.map((r) => r.revenuePerTripKd));
    const tatMin = Math.min(...raw.map((r) => r.avgTurnaroundHours));
    const tatMax = Math.max(...raw.map((r) => r.avgTurnaroundHours));

    const scored = raw
      .map((r) => {
        const tripsScore = minMax(r.trips, tripsMin, tripsMax);
        const rptScore = minMax(r.revenuePerTripKd, rptMin, rptMax);
        // Lower turnaround is better → invert.
        const tatScore = 100 - minMax(r.avgTurnaroundHours, tatMin, tatMax);
        const score = tripsScore * 0.4 + rptScore * 0.3 + tatScore * 0.3;
        return { ...r, score: round2(score) };
      })
      .sort((a, b) => b.score - a.score);

    return { periodDays, drivers: scored };
  }
}

// ─── helpers ─────────────────────────────────────────────────────────

const KUWAIT_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3, no DST

function startOfKuwaitDay(d: Date): Date {
  const utc = d.getTime();
  const local = new Date(utc + KUWAIT_OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - KUWAIT_OFFSET_MS);
}

function addDays(d: Date, delta: number): Date {
  return new Date(d.getTime() + delta * 24 * 60 * 60 * 1000);
}

function kuwaitDayKey(d: Date): string {
  const local = new Date(d.getTime() + KUWAIT_OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const day = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseKuwaitDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map((s) => Number(s));
  return new Date(Date.UTC(y, m - 1, d) - KUWAIT_OFFSET_MS);
}

function emptyDailyBucket(from: Date, toExclusive: Date): Record<string, number> {
  const out: Record<string, number> = {};
  let cursor = startOfKuwaitDay(from);
  const end = startOfKuwaitDay(toExclusive);
  while (cursor < end) {
    out[kuwaitDayKey(cursor)] = 0;
    cursor = addDays(cursor, 1);
  }
  return out;
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function stdDev(xs: number[]): number {
  if (xs.length <= 1) return 0;
  const m = avg(xs);
  const variance = xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function minMax(x: number, lo: number, hi: number): number {
  if (hi <= lo) return 50;
  return ((x - lo) / (hi - lo)) * 100;
}

function dayOfWeekFactor(
  series: Array<{ date: string; revenue?: number; expense?: number }>,
  key: 'revenue' | 'expense',
  base: number,
): Record<number, number> {
  if (base <= 0) return { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };
  const sums: Record<number, number> = {};
  const counts: Record<number, number> = {};
  for (const p of series) {
    const d = parseKuwaitDayKey(p.date).getUTCDay();
    const v = (p[key] ?? 0) as number;
    sums[d] = (sums[d] ?? 0) + v;
    counts[d] = (counts[d] ?? 0) + 1;
  }
  const out: Record<number, number> = {};
  for (let d = 0; d < 7; d += 1) {
    const mean = counts[d] ? sums[d] / counts[d] : base;
    out[d] = mean / base;
  }
  return out;
}

function flagAnomalies(
  series: Array<{ date: string; value: number }>,
  zThreshold: number,
): Array<{
  date: string;
  value: number;
  expected: number;
  zScore: number;
  direction: 'HIGH' | 'LOW';
}> {
  if (series.length < 5) return [];
  const values = series.map((p) => p.value);
  const mean = avg(values);
  const sd = stdDev(values);
  if (sd === 0) return [];
  const out: ReturnType<typeof flagAnomalies> = [];
  for (const p of series) {
    const z = (p.value - mean) / sd;
    if (Math.abs(z) >= zThreshold) {
      out.push({
        date: p.date,
        value: round3(p.value),
        expected: round3(mean),
        zScore: round2(z),
        direction: z >= 0 ? 'HIGH' : 'LOW',
      });
    }
  }
  return out.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
}

// Silence "Prisma namespace imported but unused" in builds that tree-shake
// the dev-only type.
void Prisma;
