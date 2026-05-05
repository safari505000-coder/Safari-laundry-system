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
exports.DriverRiskService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../../prisma/prisma.service");
let DriverRiskService = class DriverRiskService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getRiskyDrivers(take = 10) {
        const drivers = await this.prisma.user.findMany({
            where: { safariRole: client_1.SafariRole.DRIVER },
            select: { id: true, fullName: true, username: true },
            orderBy: { username: 'asc' },
            take: 300,
        });
        const rows = await Promise.all(drivers.map(async (driver) => {
            const [cashOrders, handedAgg] = await Promise.all([
                this.prisma.order.findMany({
                    where: {
                        driverId: driver.id,
                        status: client_1.OrderStatus.COMPLETED,
                        cashStatus: client_1.CashStatus.PAID_TO_DRIVER,
                        posPaymentMethod: client_1.PosPaymentMethod.CASH,
                        completedAt: { not: null },
                    },
                    select: { totalPrice: true, completedAt: true },
                    orderBy: { completedAt: 'asc' },
                    take: 500,
                }),
                this.prisma.managerCashCustody.aggregate({
                    where: {
                        driverId: driver.id,
                        status: {
                            in: [
                                client_1.ManagerCashCustodyStatus.PENDING_DEPOSIT,
                                client_1.ManagerCashCustodyStatus.AWAITING_VERIFICATION,
                                client_1.ManagerCashCustodyStatus.VERIFIED,
                            ],
                        },
                    },
                    _sum: { amountKd: true },
                }),
            ]);
            const collected = cashOrders.reduce((sum, order) => sum.plus(order.totalPrice), new client_1.Prisma.Decimal(0));
            const handed = handedAgg._sum.amountKd ?? new client_1.Prisma.Decimal(0);
            const oldest = cashOrders[0]?.completedAt ?? null;
            const delayHours = oldest ? Math.max((Date.now() - oldest.getTime()) / 3600000, 0) : 0;
            const riskLevel = riskFor(delayHours, handed, collected);
            return {
                driverId: driver.id,
                driverName: driver.fullName ?? driver.username ?? null,
                collectedCash: collected.toFixed(4),
                handedCash: handed.toFixed(4),
                delayHours: Math.round(delayHours * 100) / 100,
                riskLevel,
            };
        }));
        return rows
            .filter((row) => row.riskLevel !== 'LOW')
            .sort((a, b) => riskRank(b.riskLevel) - riskRank(a.riskLevel) || b.delayHours - a.delayHours)
            .slice(0, take);
    }
};
exports.DriverRiskService = DriverRiskService;
exports.DriverRiskService = DriverRiskService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DriverRiskService);
function riskFor(delayHours, handed, collected) {
    if (delayHours > 48)
        return 'HIGH';
    if (delayHours > 24)
        return 'MEDIUM';
    if (handed.lt(collected))
        return 'WARNING';
    return 'LOW';
}
function riskRank(level) {
    if (level === 'HIGH')
        return 4;
    if (level === 'MEDIUM')
        return 3;
    if (level === 'WARNING')
        return 2;
    return 1;
}
//# sourceMappingURL=driver-risk.service.js.map