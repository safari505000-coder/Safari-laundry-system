"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var InsightsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InsightsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let InsightsService = InsightsService_1 = class InsightsService {
    prisma;
    logger = new common_1.Logger(InsightsService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async cashForecast(lookbackDays = 60, horizonDays = 30) {
        const today = startOfKuwaitDay(new Date());
        const from = addDays(today, -lookbackDays);
        const to = addDays(today, 1);
        const [orders, expenses] = await Promise.all([
            this.prisma.order.findMany({
                where: {
                    completedAt: { gte: from, lt: to },
                    status: client_1.OrderStatus.COMPLETED,
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
            if (!o.completedAt)
                continue;
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
    projectDaily(historical, horizonDays) {
        if (historical.length === 0 || horizonDays <= 0)
            return [];
        const revBase = avg(historical.map((p) => p.revenue));
        const expBase = avg(historical.map((p) => p.expense));
        const revDow = dayOfWeekFactor(historical, 'revenue', revBase);
        const expDow = dayOfWeekFactor(historical, 'expense', expBase);
        const lastDayKey = historical[historical.length - 1].date;
        const lastDay = parseKuwaitDayKey(lastDayKey);
        const out = [];
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
    async detectAnomalies(windowDays = 30, zThreshold = 2) {
        const today = startOfKuwaitDay(new Date());
        const from = addDays(today, -windowDays);
        const to = addDays(today, 1);
        const [orders, expenses] = await Promise.all([
            this.prisma.order.groupBy({
                by: ['completedAt'],
                where: {
                    completedAt: { gte: from, lt: to },
                    status: client_1.OrderStatus.COMPLETED,
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
        const countByDay = {};
        for (const key of Object.keys(revenueByDay))
            countByDay[key] = 0;
        for (const o of orders) {
            if (!o.completedAt)
                continue;
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
    async driverScorecard(periodDays = 30) {
        const today = startOfKuwaitDay(new Date());
        const from = addDays(today, -periodDays);
        const to = addDays(today, 1);
        const groups = await this.prisma.order.groupBy({
            by: ['driverId'],
            where: {
                completedAt: { gte: from, lt: to },
                status: client_1.OrderStatus.COMPLETED,
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
            .filter((v) => v != null);
        const orders = await this.prisma.order.findMany({
            where: {
                completedAt: { gte: from, lt: to },
                status: client_1.OrderStatus.COMPLETED,
                driverId: { in: driverIds },
            },
            select: {
                driverId: true,
                createdAt: true,
                completedAt: true,
            },
        });
        const turnaroundSumByDriver = {};
        const turnaroundNByDriver = {};
        for (const o of orders) {
            if (!o.driverId || !o.completedAt)
                continue;
            const hrs = (o.completedAt.getTime() - o.createdAt.getTime()) / (1000 * 60 * 60);
            if (!Number.isFinite(hrs) || hrs < 0)
                continue;
            turnaroundSumByDriver[o.driverId] =
                (turnaroundSumByDriver[o.driverId] ?? 0) + hrs;
            turnaroundNByDriver[o.driverId] =
                (turnaroundNByDriver[o.driverId] ?? 0) + 1;
        }
        const users = await this.prisma.user.findMany({
            where: { id: { in: driverIds } },
            select: {
                id: true,
                fullName: true,
                username: true,
                branchId: true,
                branch: { select: { name: true } },
            },
        });
        const userIndex = new Map(users.map((u) => [u.id, u]));
        const raw = groups
            .filter((g) => g.driverId)
            .map((g) => {
            const id = g.driverId;
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
            const tatScore = 100 - minMax(r.avgTurnaroundHours, tatMin, tatMax);
            const score = tripsScore * 0.4 + rptScore * 0.3 + tatScore * 0.3;
            return { ...r, score: round2(score) };
        })
            .sort((a, b) => b.score - a.score);
        return { periodDays, drivers: scored };
    }
};
exports.InsightsService = InsightsService;
exports.InsightsService = InsightsService = InsightsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], InsightsService);
const KUWAIT_OFFSET_MS = 3 * 60 * 60 * 1000;
function startOfKuwaitDay(d) {
    const utc = d.getTime();
    const local = new Date(utc + KUWAIT_OFFSET_MS);
    local.setUTCHours(0, 0, 0, 0);
    return new Date(local.getTime() - KUWAIT_OFFSET_MS);
}
function addDays(d, delta) {
    return new Date(d.getTime() + delta * 24 * 60 * 60 * 1000);
}
function kuwaitDayKey(d) {
    const local = new Date(d.getTime() + KUWAIT_OFFSET_MS);
    const y = local.getUTCFullYear();
    const m = String(local.getUTCMonth() + 1).padStart(2, '0');
    const day = String(local.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
function parseKuwaitDayKey(key) {
    const [y, m, d] = key.split('-').map((s) => Number(s));
    return new Date(Date.UTC(y, m - 1, d) - KUWAIT_OFFSET_MS);
}
function emptyDailyBucket(from, toExclusive) {
    const out = {};
    let cursor = startOfKuwaitDay(from);
    const end = startOfKuwaitDay(toExclusive);
    while (cursor < end) {
        out[kuwaitDayKey(cursor)] = 0;
        cursor = addDays(cursor, 1);
    }
    return out;
}
function avg(xs) {
    if (xs.length === 0)
        return 0;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function sum(xs) {
    return xs.reduce((a, b) => a + b, 0);
}
function stdDev(xs) {
    if (xs.length <= 1)
        return 0;
    const m = avg(xs);
    const variance = xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1);
    return Math.sqrt(variance);
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
function round3(n) {
    return Math.round(n * 1000) / 1000;
}
function minMax(x, lo, hi) {
    if (hi <= lo)
        return 50;
    return ((x - lo) / (hi - lo)) * 100;
}
function dayOfWeekFactor(series, key, base) {
    if (base <= 0)
        return { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };
    const sums = {};
    const counts = {};
    for (const p of series) {
        const d = parseKuwaitDayKey(p.date).getUTCDay();
        const v = (p[key] ?? 0);
        sums[d] = (sums[d] ?? 0) + v;
        counts[d] = (counts[d] ?? 0) + 1;
    }
    const out = {};
    for (let d = 0; d < 7; d += 1) {
        const mean = counts[d] ? sums[d] / counts[d] : base;
        out[d] = mean / base;
    }
    return out;
}
function flagAnomalies(series, zThreshold) {
    if (series.length < 5)
        return [];
    const values = series.map((p) => p.value);
    const mean = avg(values);
    const sd = stdDev(values);
    if (sd === 0)
        return [];
    const out = [];
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
void client_1.Prisma;
//# sourceMappingURL=insights.service.js.map