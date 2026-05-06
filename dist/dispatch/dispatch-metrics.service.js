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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DispatchMetricsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let DispatchMetricsService = class DispatchMetricsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    kuwaitCalendarDateUtc(d) {
        const key = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kuwait',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(d);
        const [y, m, day] = key.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, day));
    }
    async incrementAssigned(driverId, at) {
        const date = this.kuwaitCalendarDateUtc(at);
        await this.prisma.driverMetrics.upsert({
            where: { driverId_date: { driverId, date } },
            create: {
                driverId,
                date,
                assignedCount: 1,
            },
            update: {
                assignedCount: { increment: 1 },
            },
        });
    }
    async recordAcknowledged(driverId, at, ackMinutes) {
        const date = this.kuwaitCalendarDateUtc(at);
        const existing = await this.prisma.driverMetrics.findUnique({
            where: { driverId_date: { driverId, date } },
        });
        const nextAckCount = (existing?.acknowledgedCount ?? 0) + 1;
        const prevAvg = existing?.avgAckMinutes ?? null;
        const nextAvgAck = nextAckCount === 1 || prevAvg == null ?
            ackMinutes
            : (prevAvg * (nextAckCount - 1) + ackMinutes) / nextAckCount;
        await this.prisma.driverMetrics.upsert({
            where: { driverId_date: { driverId, date } },
            create: {
                driverId,
                date,
                acknowledgedCount: 1,
                avgAckMinutes: ackMinutes,
            },
            update: {
                acknowledgedCount: { increment: 1 },
                avgAckMinutes: nextAvgAck,
            },
        });
    }
    async recordCompletion(input) {
        const date = this.kuwaitCalendarDateUtc(input.at);
        let lateDelta = 0;
        let breachDelta = 0;
        if (input.totalMinutes > 5)
            breachDelta = 1;
        else if (input.totalMinutes > 2)
            lateDelta = 1;
        const existing = await this.prisma.driverMetrics.findUnique({
            where: { driverId_date: { driverId: input.driverId, date } },
        });
        const nextCompleted = (existing?.completedCount ?? 0) + 1;
        const prevTotAvg = existing?.avgTotalMinutes ?? null;
        const nextTotAvg = nextCompleted === 1 || prevTotAvg == null ?
            input.totalMinutes
            : (prevTotAvg * (nextCompleted - 1) + input.totalMinutes) /
                nextCompleted;
        await this.prisma.driverMetrics.upsert({
            where: { driverId_date: { driverId: input.driverId, date } },
            create: {
                driverId: input.driverId,
                date,
                completedCount: 1,
                lateCount: lateDelta,
                breachedCount: breachDelta,
                avgTotalMinutes: input.totalMinutes,
            },
            update: {
                completedCount: { increment: 1 },
                lateCount: { increment: lateDelta },
                breachedCount: { increment: breachDelta },
                avgTotalMinutes: nextTotAvg,
            },
        });
    }
};
exports.DispatchMetricsService = DispatchMetricsService;
exports.DispatchMetricsService = DispatchMetricsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DispatchMetricsService);
//# sourceMappingURL=dispatch-metrics.service.js.map