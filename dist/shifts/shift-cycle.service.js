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
var ShiftCycleService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShiftCycleService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const kuwait_time_1 = require("../common/time/kuwait-time");
let ShiftCycleService = ShiftCycleService_1 = class ShiftCycleService {
    prisma;
    logger = new common_1.Logger(ShiftCycleService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async handleCron() {
        try {
            const result = await this.runDailyCycle();
            this.logger.log(`[shift-cycle] cron tick closed=${result.closed} opened=${result.opened} boundary=${result.cycleStartAt}`);
        }
        catch (err) {
            this.logger.error('[shift-cycle] cron tick failed', err);
        }
    }
    async runDailyCycle() {
        const now = new Date();
        const boundary = (0, kuwait_time_1.kuwaitMidnightUtc)(now);
        return this.prisma.$transaction(async (tx) => {
            const stale = await tx.shift.updateMany({
                where: { status: client_1.ShiftStatus.OPEN, startedAt: { lt: boundary } },
                data: {
                    status: client_1.ShiftStatus.CLOSED,
                    endedAt: new Date(boundary.getTime() - 1),
                },
            });
            const activeDrivers = await tx.user.findMany({
                where: { safariRole: client_1.SafariRole.DRIVER, isActive: true },
                select: { id: true },
            });
            if (activeDrivers.length === 0) {
                return {
                    closed: stale.count,
                    opened: 0,
                    cycleStartAt: boundary.toISOString(),
                };
            }
            const driverIds = activeDrivers.map((d) => d.id);
            const existingOpen = await tx.shift.findMany({
                where: {
                    status: client_1.ShiftStatus.OPEN,
                    driverId: { in: driverIds },
                    startedAt: { gte: boundary },
                },
                select: { driverId: true },
            });
            const openDriverSet = new Set(existingOpen.map((s) => s.driverId));
            const toOpen = driverIds.filter((id) => !openDriverSet.has(id));
            if (toOpen.length > 0) {
                await tx.shift.createMany({
                    data: toOpen.map((driverId) => ({
                        driverId,
                        status: client_1.ShiftStatus.OPEN,
                        startedAt: boundary,
                    })),
                });
            }
            return {
                closed: stale.count,
                opened: toOpen.length,
                cycleStartAt: boundary.toISOString(),
            };
        });
    }
    async getCurrentCycle() {
        const now = new Date();
        const start = (0, kuwait_time_1.kuwaitMidnightUtc)(now);
        const next = (0, kuwait_time_1.nextKuwaitMidnightUtc)(now);
        const end = new Date(next.getTime() - 1);
        const [driversOnShift, staleOpen, activeDriversTotal] = await Promise.all([
            this.prisma.shift.count({
                where: { status: client_1.ShiftStatus.OPEN, startedAt: { gte: start } },
            }),
            this.prisma.shift.count({
                where: { status: client_1.ShiftStatus.OPEN, startedAt: { lt: start } },
            }),
            this.prisma.user.count({
                where: { safariRole: client_1.SafariRole.DRIVER, isActive: true },
            }),
        ]);
        return {
            timezone: kuwait_time_1.KUWAIT_TIMEZONE,
            cycleStartAt: start.toISOString(),
            cycleEndAt: end.toISOString(),
            nextCycleAt: next.toISOString(),
            driversOnShift,
            activeDriversTotal,
            staleOpenShifts: staleOpen,
        };
    }
    async getRecentCycles(days = 7) {
        const capped = Math.max(1, Math.min(30, days));
        const now = new Date();
        const today = (0, kuwait_time_1.kuwaitMidnightUtc)(now);
        const results = [];
        for (let i = 0; i < capped; i += 1) {
            const start = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
            const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
            const [opened, closed] = await Promise.all([
                this.prisma.shift.count({
                    where: { startedAt: { gte: start, lt: end } },
                }),
                this.prisma.shift.count({
                    where: { endedAt: { gte: start, lt: end } },
                }),
            ]);
            results.push({
                cycleStartAt: start.toISOString(),
                cycleEndAt: new Date(end.getTime() - 1).toISOString(),
                shiftsOpened: opened,
                shiftsClosed: closed,
            });
        }
        return results;
    }
};
exports.ShiftCycleService = ShiftCycleService;
__decorate([
    (0, schedule_1.Cron)('0 0 * * *', { name: 'shift-cycle-daily', timeZone: kuwait_time_1.KUWAIT_TIMEZONE }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ShiftCycleService.prototype, "handleCron", null);
exports.ShiftCycleService = ShiftCycleService = ShiftCycleService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ShiftCycleService);
//# sourceMappingURL=shift-cycle.service.js.map