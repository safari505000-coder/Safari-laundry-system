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
exports.SafariStreamService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const permissions_service_1 = require("../permissions/permissions.service");
const prisma_service_1 = require("../prisma/prisma.service");
let SafariStreamService = class SafariStreamService {
    prisma;
    permissionsService;
    constructor(prisma, permissionsService) {
        this.prisma = prisma;
        this.permissionsService = permissionsService;
    }
    async buildSnapshot(userId, jwtRole) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                username: true,
                fullName: true,
                phone: true,
                safariRole: true,
                branchId: true,
            },
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        const permissionKeys = await this.permissionsService.listPermissionKeysForRoleName(jwtRole);
        let fieldCashAvailableKd = null;
        let pendingDepositHoldKd = null;
        let pendingDebtOrdersKd = null;
        if (user.safariRole === client_1.SafariRole.DRIVER) {
            const [cashSum, expSum, depSum, debtSum] = await Promise.all([
                this.prisma.order.aggregate({
                    where: {
                        driverId: userId,
                        status: client_1.OrderStatus.COMPLETED,
                        cashStatus: client_1.CashStatus.PAID_TO_DRIVER,
                        posPaymentMethod: client_1.PosPaymentMethod.CASH,
                    },
                    _sum: { totalPrice: true },
                }),
                this.prisma.branchExpense.aggregate({
                    where: {
                        recordedById: userId,
                        status: { in: [client_1.ExpenseStatus.APPROVED, client_1.ExpenseStatus.AUDIT] },
                    },
                    _sum: { amount: true },
                }),
                this.prisma.deposit.aggregate({
                    where: { driverId: userId, status: client_1.DepositStatus.PENDING },
                    _sum: { amount: true },
                }),
                this.prisma.order.aggregate({
                    where: {
                        driverId: userId,
                        status: client_1.OrderStatus.COMPLETED,
                        posPaymentMethod: client_1.PosPaymentMethod.DEBT_ON_ACCOUNT,
                    },
                    _sum: { totalPrice: true },
                }),
            ]);
            const cash = new client_1.Prisma.Decimal(cashSum._sum.totalPrice?.toString() ?? '0');
            const exp = new client_1.Prisma.Decimal(expSum._sum.amount?.toString() ?? '0');
            const pend = new client_1.Prisma.Decimal(depSum._sum.amount?.toString() ?? '0');
            const debt = new client_1.Prisma.Decimal(debtSum._sum.totalPrice?.toString() ?? '0');
            fieldCashAvailableKd = cash.sub(exp).sub(pend).toFixed(4);
            pendingDepositHoldKd = pend.toFixed(4);
            pendingDebtOrdersKd = debt.toFixed(4);
        }
        return {
            stream: 'safari-erp-v1',
            user: {
                id: user.id,
                username: user.username,
                fullName: user.fullName,
                phone: user.phone,
                safariRole: user.safariRole,
                branchId: user.branchId,
            },
            wallet: {
                fieldCashAvailableKd,
                pendingDepositHoldKd,
                pendingDebtOrdersKd,
            },
            permissions: permissionKeys,
        };
    }
};
exports.SafariStreamService = SafariStreamService;
exports.SafariStreamService = SafariStreamService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        permissions_service_1.PermissionsService])
], SafariStreamService);
//# sourceMappingURL=safari-stream.service.js.map