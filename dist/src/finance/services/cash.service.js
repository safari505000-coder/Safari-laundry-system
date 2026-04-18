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
exports.CashService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../../prisma/prisma.service");
const finance_money_1 = require("../finance-money");
const KUWAIT_OFFSET_MIN = 180;
function kuwaitMidnightUtc(nowUtc) {
    const k = new Date(nowUtc.getTime() + KUWAIT_OFFSET_MIN * 60_000);
    const y = k.getUTCFullYear();
    const m = k.getUTCMonth();
    const d = k.getUTCDate();
    const utcMs = Date.UTC(y, m, d, 0, 0, 0, 0) - KUWAIT_OFFSET_MIN * 60_000;
    return new Date(utcMs);
}
function parseLatLng(input) {
    if (!input)
        return null;
    const parts = input.split(',').map((x) => Number.parseFloat(x.trim()));
    if (parts.length !== 2)
        return null;
    const [lat, lng] = parts;
    if (!Number.isFinite(lat) || !Number.isFinite(lng))
        return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180)
        return null;
    return { lat, lng };
}
let CashService = class CashService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async ensureOpenShiftForDriver(driverId) {
        const user = await this.prisma.user.findUnique({ where: { id: driverId } });
        if (!user || user.safariRole !== client_1.SafariRole.DRIVER)
            return;
        const open = await this.prisma.shift.findFirst({
            where: { driverId, status: client_1.ShiftStatus.OPEN },
            orderBy: { startedAt: 'desc' },
        });
        if (open) {
            const midnightUtc = kuwaitMidnightUtc(new Date());
            if (open.startedAt.getTime() < midnightUtc.getTime()) {
                await this.prisma.shift.update({
                    where: { id: open.id },
                    data: {
                        status: client_1.ShiftStatus.CLOSED,
                        endedAt: new Date(midnightUtc.getTime() - 1),
                    },
                });
                await this.prisma.shift.create({
                    data: { driverId, status: client_1.ShiftStatus.OPEN },
                });
            }
            return;
        }
        await this.prisma.shift.create({
            data: { driverId, status: client_1.ShiftStatus.OPEN },
        });
    }
    async getDailyPosSalesByPaymentMethod(fromIso, toIso, scopedDriverId) {
        const from = new Date(fromIso);
        const to = new Date(toIso);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
            throw new common_1.BadRequestException('Invalid date range');
        }
        const rows = await this.prisma.order.groupBy({
            by: ['posPaymentMethod'],
            where: {
                status: client_1.OrderStatus.COMPLETED,
                completedAt: { gte: from, lte: to },
                posPaymentMethod: { not: null },
                ...(scopedDriverId ? { driverId: scopedDriverId } : {}),
            },
            _sum: { totalPrice: true },
            _count: true,
        });
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            rows: rows
                .filter((r) => r.posPaymentMethod !== null)
                .map((r) => ({
                posPaymentMethod: r.posPaymentMethod,
                orderCount: r._count,
                totalRevenue: r._sum.totalPrice !== null && r._sum.totalPrice !== undefined
                    ? r._sum.totalPrice.toString()
                    : '0',
            })),
        };
    }
    async getDriverBalances() {
        const drivers = await this.prisma.user.findMany({
            where: { safariRole: client_1.SafariRole.DRIVER },
            select: {
                id: true,
                username: true,
                fullName: true,
                employeeId: true,
                phone: true,
                branchId: true,
            },
            orderBy: { username: 'asc' },
        });
        const rows = [];
        for (const d of drivers) {
            const shift = await this.prisma.shift.findFirst({
                where: { driverId: d.id, status: client_1.ShiftStatus.OPEN },
                orderBy: { startedAt: 'desc' },
            });
            const pendingAll = await this.prisma.order.findMany({
                where: {
                    driverId: d.id,
                    status: client_1.OrderStatus.COMPLETED,
                    cashStatus: client_1.CashStatus.PAID_TO_DRIVER,
                },
                select: { totalPrice: true, posPaymentMethod: true },
            });
            const buckets = {
                cash: [],
                knet: [],
                link: [],
                online: [],
            };
            for (const o of pendingAll) {
                switch (o.posPaymentMethod) {
                    case client_1.PosPaymentMethod.CASH:
                        buckets.cash.push({ totalPrice: o.totalPrice });
                        break;
                    case client_1.PosPaymentMethod.KNET:
                        buckets.knet.push({ totalPrice: o.totalPrice });
                        break;
                    case client_1.PosPaymentMethod.PAYMENT_LINK:
                        buckets.link.push({ totalPrice: o.totalPrice });
                        break;
                    case client_1.PosPaymentMethod.ONLINE:
                        buckets.online.push({ totalPrice: o.totalPrice });
                        break;
                    default:
                        break;
                }
            }
            const cashMinor = (0, finance_money_1.sumOrderMinors)(buckets.cash);
            const knetMinor = (0, finance_money_1.sumOrderMinors)(buckets.knet);
            const linkMinor = (0, finance_money_1.sumOrderMinors)(buckets.link);
            const onlineMinor = (0, finance_money_1.sumOrderMinors)(buckets.online);
            const totalMinor = cashMinor + knetMinor + linkMinor + onlineMinor;
            rows.push({
                driverId: d.id,
                employeeId: d.employeeId,
                username: d.username,
                fullName: d.fullName,
                phone: d.phone,
                branchId: d.branchId,
                currentShiftId: shift?.id ?? null,
                shiftStartedAt: shift?.startedAt ?? null,
                heldCashTotal: (0, finance_money_1.minorToAmountString)(cashMinor),
                pendingSettlementOrderCount: buckets.cash.length,
                pendingCashKd: (0, finance_money_1.minorToAmountString)(cashMinor),
                pendingKnetKd: (0, finance_money_1.minorToAmountString)(knetMinor),
                pendingLinkKd: (0, finance_money_1.minorToAmountString)(linkMinor),
                pendingOnlineKd: (0, finance_money_1.minorToAmountString)(onlineMinor),
                pendingTotalKd: (0, finance_money_1.minorToAmountString)(totalMinor),
                pendingInvoiceCount: buckets.cash.length +
                    buckets.knet.length +
                    buckets.link.length +
                    buckets.online.length,
            });
        }
        return { drivers: rows };
    }
    async getTotalCashWithDrivers() {
        const rows = await this.prisma.order.findMany({
            where: {
                status: client_1.OrderStatus.COMPLETED,
                cashStatus: client_1.CashStatus.PAID_TO_DRIVER,
                posPaymentMethod: client_1.PosPaymentMethod.CASH,
            },
            select: { totalPrice: true },
        });
        return (0, finance_money_1.minorToAmountString)((0, finance_money_1.sumOrderMinors)(rows));
    }
    async getDriverMonitoring() {
        const activeDrivers = await this.prisma.user.findMany({
            where: {
                safariRole: client_1.SafariRole.DRIVER,
                shiftsAsDriver: { some: { status: client_1.ShiftStatus.OPEN } },
            },
            orderBy: { fullName: 'asc' },
            select: {
                id: true,
                fullName: true,
                username: true,
                phone: true,
                vehicleLabel: true,
                lastKnownLocation: true,
                branch: { select: { id: true, name: true, location: true } },
            },
        });
        return {
            drivers: activeDrivers.map((d) => {
                const live = parseLatLng(d.lastKnownLocation);
                const fallback = parseLatLng(d.branch?.location ?? null);
                const location = live ?? fallback;
                return {
                    driverId: d.id,
                    fullName: d.fullName,
                    username: d.username,
                    phone: d.phone,
                    vehicleLabel: d.vehicleLabel ?? 'Toyota LC300',
                    status: 'ON_SHIFT',
                    source: live ? 'LIVE_GPS' : 'BRANCH_FALLBACK',
                    lastKnownLocation: live,
                    markerLocation: location,
                    branch: d.branch,
                };
            }),
        };
    }
    async updateDriverTracking(driverId, dto) {
        const driver = await this.prisma.user.findUnique({
            where: { id: driverId },
            select: { id: true, safariRole: true },
        });
        if (!driver || driver.safariRole !== client_1.SafariRole.DRIVER) {
            throw new common_1.NotFoundException('Driver not found');
        }
        if (dto.lastKnownLocation !== undefined &&
            dto.lastKnownLocation.trim().length > 0 &&
            !parseLatLng(dto.lastKnownLocation)) {
            throw new common_1.BadRequestException('lastKnownLocation must be "lat,lng"');
        }
        return this.prisma.user.update({
            where: { id: driverId },
            data: {
                ...(dto.vehicleLabel !== undefined
                    ? { vehicleLabel: dto.vehicleLabel.trim() || null }
                    : {}),
                ...(dto.lastKnownLocation !== undefined
                    ? { lastKnownLocation: dto.lastKnownLocation.trim() || null }
                    : {}),
            },
            select: {
                id: true,
                fullName: true,
                username: true,
                vehicleLabel: true,
                lastKnownLocation: true,
            },
        });
    }
    async confirmHandover(managerId, dto) {
        const driver = await this.prisma.user.findUnique({
            where: { id: dto.driverId },
        });
        if (!driver || driver.safariRole !== client_1.SafariRole.DRIVER) {
            throw new common_1.NotFoundException('Driver not found');
        }
        return this.prisma.$transaction(async (tx) => {
            const pending = await tx.order.findMany({
                where: {
                    driverId: dto.driverId,
                    status: client_1.OrderStatus.COMPLETED,
                    cashStatus: client_1.CashStatus.PAID_TO_DRIVER,
                    posPaymentMethod: client_1.PosPaymentMethod.CASH,
                },
                select: { id: true, totalPrice: true },
            });
            const systemMinor = (0, finance_money_1.sumOrderMinors)(pending);
            if (dto.declaredHandoverTotal !== undefined) {
                try {
                    (0, finance_money_1.assertDeclaredMatchesLedgerMinor)(systemMinor, dto.declaredHandoverTotal);
                }
                catch (e) {
                    throw new common_1.BadRequestException(e instanceof Error ? e.message : 'Declared total mismatch');
                }
            }
            const shift = await tx.shift.findFirst({
                where: { driverId: dto.driverId, status: client_1.ShiftStatus.OPEN },
                orderBy: { startedAt: 'desc' },
            });
            if (pending.length === 0) {
                if (!shift) {
                    throw new common_1.BadRequestException('No cash pending settlement and no open shift to close.');
                }
                await tx.shift.update({
                    where: { id: shift.id },
                    data: {
                        status: client_1.ShiftStatus.CLOSED,
                        endedAt: new Date(),
                        systemHandoverTotal: '0.0000',
                        declaredHandoverTotal: dto.declaredHandoverTotal !== undefined
                            ? dto.declaredHandoverTotal.toFixed(4)
                            : null,
                        ordersSettledCount: 0,
                        bankDepositReceiptUrl: dto.depositReceiptUrl ?? null,
                        confirmedByManagerId: managerId,
                        confirmedAt: new Date(),
                    },
                });
                return {
                    settledOrderCount: 0,
                    systemHandoverTotal: '0.0000',
                    shiftId: shift.id,
                    bankDepositReceiptUrl: dto.depositReceiptUrl ?? null,
                };
            }
            if (!shift) {
                throw new common_1.BadRequestException('Ledger shows cash due but the driver has no OPEN shift. Reconcile before handover.');
            }
            const ids = pending.map((o) => o.id);
            const updated = await tx.order.updateMany({
                where: {
                    id: { in: ids },
                    cashStatus: client_1.CashStatus.PAID_TO_DRIVER,
                    posPaymentMethod: client_1.PosPaymentMethod.CASH,
                },
                data: {
                    cashStatus: client_1.CashStatus.HANDED_OVER_TO_OFFICE,
                    handoverShiftId: shift.id,
                },
            });
            if (updated.count !== pending.length) {
                throw new common_1.ConflictException('Concurrent handover detected; not all orders could be settled. Retry.');
            }
            const systemHandoverTotal = (0, finance_money_1.minorToAmountString)(systemMinor);
            await tx.shift.update({
                where: { id: shift.id },
                data: {
                    status: client_1.ShiftStatus.CLOSED,
                    endedAt: new Date(),
                    systemHandoverTotal,
                    declaredHandoverTotal: dto.declaredHandoverTotal !== undefined
                        ? dto.declaredHandoverTotal.toFixed(4)
                        : null,
                    ordersSettledCount: pending.length,
                    bankDepositReceiptUrl: dto.depositReceiptUrl ?? null,
                    confirmedByManagerId: managerId,
                    confirmedAt: new Date(),
                },
            });
            const manager = await tx.user.findUnique({
                where: { id: managerId },
                select: { branchId: true },
            });
            const hasSlip = Boolean(dto.depositReceiptUrl);
            await tx.managerCashCustody.create({
                data: {
                    managerId,
                    driverId: dto.driverId,
                    branchId: manager?.branchId ?? driver.branchId ?? null,
                    shiftId: shift.id,
                    amountKd: systemHandoverTotal,
                    settledOrderCount: pending.length,
                    status: hasSlip
                        ? client_1.ManagerCashCustodyStatus.AWAITING_VERIFICATION
                        : client_1.ManagerCashCustodyStatus.PENDING_DEPOSIT,
                    depositSlipUrl: dto.depositReceiptUrl ?? null,
                    slipUploadedAt: hasSlip ? new Date() : null,
                },
            });
            return {
                settledOrderCount: pending.length,
                systemHandoverTotal,
                shiftId: shift.id,
                bankDepositReceiptUrl: dto.depositReceiptUrl ?? null,
            };
        });
    }
    async getOwnerFinancialCycleReport() {
        const rows = await this.prisma.order.findMany({
            where: {
                posPaymentMethod: client_1.PosPaymentMethod.CASH,
                handoverShiftId: { not: null },
            },
            orderBy: { updatedAt: 'desc' },
            take: 1000,
            select: {
                id: true,
                totalPrice: true,
                updatedAt: true,
                handoverShift: {
                    select: {
                        id: true,
                        confirmedAt: true,
                        confirmedByManager: {
                            select: { id: true, fullName: true, username: true },
                        },
                        bankDepositLogs: {
                            orderBy: { createdAt: 'desc' },
                            take: 1,
                            select: {
                                id: true,
                                receiptImageUrl: true,
                                verifiedAt: true,
                                verifiedByAccountant: {
                                    select: { id: true, fullName: true, username: true },
                                },
                            },
                        },
                    },
                },
            },
        });
        return {
            rows: rows.map((o) => {
                const shift = o.handoverShift;
                const deposit = shift?.bankDepositLogs[0] ?? null;
                return {
                    orderId: o.id,
                    amountKd: o.totalPrice.toString(),
                    collectedAt: shift?.confirmedAt?.toISOString() ?? null,
                    collectedByManager: shift?.confirmedByManager ?? null,
                    depositLogId: deposit?.id ?? null,
                    receiptImageUrl: deposit?.receiptImageUrl ?? null,
                    verifiedAt: deposit?.verifiedAt?.toISOString() ?? null,
                    verifiedByAccountant: deposit?.verifiedByAccountant ?? null,
                    lastUpdatedAt: o.updatedAt.toISOString(),
                };
            }),
        };
    }
};
exports.CashService = CashService;
exports.CashService = CashService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CashService);
//# sourceMappingURL=cash.service.js.map