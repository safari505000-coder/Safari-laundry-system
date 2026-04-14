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
exports.FinanceService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const finance_money_1 = require("./finance-money");
let FinanceService = class FinanceService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async ensureOpenShiftForDriver(driverId) {
        const user = await this.prisma.user.findUnique({ where: { id: driverId } });
        if (!user || user.safariRole !== client_1.SafariRole.DRIVER) {
            return;
        }
        const open = await this.prisma.shift.findFirst({
            where: { driverId, status: client_1.ShiftStatus.OPEN },
        });
        if (open) {
            return;
        }
        await this.prisma.shift.create({
            data: { driverId, status: client_1.ShiftStatus.OPEN },
        });
    }
    async getOwnerCustomerWalletSummary() {
        const agg = await this.prisma.customerWallet.aggregate({
            _sum: { balance: true, debt: true },
        });
        return {
            totalWalletLiabilities: agg._sum.balance !== null && agg._sum.balance !== undefined
                ? agg._sum.balance.toString()
                : '0',
            totalCustomerDebts: agg._sum.debt !== null && agg._sum.debt !== undefined
                ? agg._sum.debt.toString()
                : '0',
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
            },
            orderBy: { username: 'asc' },
        });
        const rows = [];
        for (const d of drivers) {
            const shift = await this.prisma.shift.findFirst({
                where: { driverId: d.id, status: client_1.ShiftStatus.OPEN },
                orderBy: { startedAt: 'desc' },
            });
            const pending = await this.prisma.order.findMany({
                where: {
                    driverId: d.id,
                    status: client_1.OrderStatus.COMPLETED,
                    cashStatus: client_1.CashStatus.PAID_TO_DRIVER,
                },
                select: { totalPrice: true },
            });
            const heldMinor = (0, finance_money_1.sumOrderMinors)(pending);
            rows.push({
                driverId: d.id,
                employeeId: d.employeeId,
                username: d.username,
                fullName: d.fullName,
                phone: d.phone,
                currentShiftId: shift?.id ?? null,
                shiftStartedAt: shift?.startedAt ?? null,
                heldCashTotal: (0, finance_money_1.minorToAmountString)(heldMinor),
                pendingSettlementOrderCount: pending.length,
            });
        }
        return { drivers: rows };
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
                if (shift) {
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
                            confirmedByManagerId: managerId,
                            confirmedAt: new Date(),
                        },
                    });
                    return {
                        settledOrderCount: 0,
                        systemHandoverTotal: '0.0000',
                        shiftId: shift.id,
                    };
                }
                throw new common_1.BadRequestException('No cash pending settlement and no open shift to close.');
            }
            if (!shift) {
                throw new common_1.BadRequestException('Ledger shows cash due but the driver has no OPEN shift. Reconcile before handover.');
            }
            const ids = pending.map((o) => o.id);
            const updated = await tx.order.updateMany({
                where: {
                    id: { in: ids },
                    cashStatus: client_1.CashStatus.PAID_TO_DRIVER,
                },
                data: { cashStatus: client_1.CashStatus.HANDED_OVER_TO_OFFICE },
            });
            if (updated.count !== pending.length) {
                throw new common_1.ConflictException('Concurrent handover detected; not all orders could be settled. Retry.');
            }
            await tx.shift.update({
                where: { id: shift.id },
                data: {
                    status: client_1.ShiftStatus.CLOSED,
                    endedAt: new Date(),
                    systemHandoverTotal: (0, finance_money_1.minorToAmountString)(systemMinor),
                    declaredHandoverTotal: dto.declaredHandoverTotal !== undefined
                        ? dto.declaredHandoverTotal.toFixed(4)
                        : null,
                    ordersSettledCount: pending.length,
                    confirmedByManagerId: managerId,
                    confirmedAt: new Date(),
                },
            });
            return {
                settledOrderCount: pending.length,
                systemHandoverTotal: (0, finance_money_1.minorToAmountString)(systemMinor),
                shiftId: shift.id,
            };
        });
    }
};
exports.FinanceService = FinanceService;
exports.FinanceService = FinanceService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], FinanceService);
//# sourceMappingURL=finance.service.js.map