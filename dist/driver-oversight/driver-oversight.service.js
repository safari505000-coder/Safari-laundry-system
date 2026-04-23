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
exports.DriverOversightService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const kuwait_time_1 = require("../common/time/kuwait-time");
const STALE_QUICK_HOURS = 24;
let DriverOversightService = class DriverOversightService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async listForBranchManager(branchId) {
        if (!branchId)
            return [];
        const drivers = await this.prisma.user.findMany({
            where: {
                role: { name: client_1.SafariRole.DRIVER },
                branchId,
                isActive: true,
            },
            select: {
                id: true,
                fullName: true,
                username: true,
                phone: true,
                branch: { select: { id: true, name: true } },
            },
            orderBy: { fullName: 'asc' },
        });
        if (drivers.length === 0)
            return [];
        return this.buildCards(drivers);
    }
    async listForAllBranches() {
        const drivers = await this.prisma.user.findMany({
            where: {
                role: { name: client_1.SafariRole.DRIVER },
                isActive: true,
            },
            select: {
                id: true,
                fullName: true,
                username: true,
                phone: true,
                branch: { select: { id: true, name: true } },
            },
            orderBy: { fullName: 'asc' },
        });
        return this.buildCards(drivers);
    }
    async buildCards(drivers) {
        const driverIds = drivers.map((d) => d.id);
        const todayStart = (0, kuwait_time_1.kuwaitMidnightUtc)(new Date());
        const staleCutoff = new Date(Date.now() - STALE_QUICK_HOURS * 60 * 60 * 1000);
        const [openShifts, todayOrders, pendingOrders, heldCashRows, staleRows] = await Promise.all([
            this.prisma.shift.findMany({
                where: {
                    driverId: { in: driverIds },
                    status: client_1.ShiftStatus.OPEN,
                },
                select: { driverId: true, startedAt: true },
                orderBy: { startedAt: 'desc' },
            }),
            this.prisma.order.groupBy({
                by: ['driverId'],
                where: {
                    driverId: { in: driverIds },
                    createdAt: { gte: todayStart },
                    status: { not: client_1.OrderStatus.CANCELED },
                },
                _count: { _all: true },
                _sum: { totalPrice: true },
            }),
            this.prisma.order.groupBy({
                by: ['driverId'],
                where: {
                    driverId: { in: driverIds },
                    cashStatus: client_1.CashStatus.UNPAID,
                    status: { not: client_1.OrderStatus.CANCELED },
                },
                _count: { _all: true },
            }),
            this.prisma.order.groupBy({
                by: ['driverId'],
                where: {
                    driverId: { in: driverIds },
                    cashStatus: client_1.CashStatus.PAID_TO_DRIVER,
                    status: { not: client_1.OrderStatus.CANCELED },
                },
                _sum: { totalPrice: true },
            }),
            this.prisma.order.groupBy({
                by: ['driverId'],
                where: {
                    driverId: { in: driverIds },
                    status: client_1.OrderStatus.PENDING,
                    cashStatus: client_1.CashStatus.UNPAID,
                    createdAt: { lt: staleCutoff },
                    posPaymentMethod: { not: null },
                },
                _count: { _all: true },
                _sum: { totalPrice: true },
            }),
        ]);
        const firstShiftByDriver = new Map();
        for (const s of openShifts) {
            if (!firstShiftByDriver.has(s.driverId)) {
                firstShiftByDriver.set(s.driverId, s.startedAt);
            }
        }
        const byDriver = (rows) => {
            const m = new Map();
            for (const r of rows) {
                if (r.driverId)
                    m.set(r.driverId, r);
            }
            return m;
        };
        const todayMap = byDriver(todayOrders);
        const pendingMap = byDriver(pendingOrders);
        const heldMap = byDriver(heldCashRows);
        const staleMap = byDriver(staleRows);
        return drivers.map((d) => {
            const shiftStart = firstShiftByDriver.get(d.id) ?? null;
            const today = todayMap.get(d.id);
            const pending = pendingMap.get(d.id);
            const held = heldMap.get(d.id);
            const stale = staleMap.get(d.id);
            const heldCash = held?._sum.totalPrice ?? new client_1.Prisma.Decimal(0);
            const staleKd = stale?._sum.totalPrice ?? new client_1.Prisma.Decimal(0);
            const pendingCount = pending?._count._all ?? 0;
            const staleCount = stale?._count._all ?? 0;
            const atRisk = staleCount > 0 || pendingCount > 10;
            return {
                driverId: d.id,
                fullName: d.fullName,
                username: d.username,
                phone: d.phone,
                branch: d.branch,
                shiftStatus: shiftStart ? 'ON_SHIFT' : 'OFF',
                shiftStartedAt: shiftStart ? shiftStart.toISOString() : null,
                ordersTodayCount: today?._count._all ?? 0,
                cashTodayKd: (today?._sum.totalPrice ?? new client_1.Prisma.Decimal(0)).toFixed(3),
                pendingInvoicesCount: pendingCount,
                heldCashKd: heldCash.toFixed(3),
                staleQuickCount: staleCount,
                staleQuickKd: staleKd.toFixed(3),
                atRisk,
            };
        });
    }
};
exports.DriverOversightService = DriverOversightService;
exports.DriverOversightService = DriverOversightService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DriverOversightService);
//# sourceMappingURL=driver-oversight.service.js.map