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
exports.CallCenterService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const customer_ledger_service_1 = require("../customer-ledger/customer-ledger.service");
let CallCenterService = class CallCenterService {
    prisma;
    customerLedger;
    constructor(prisma, customerLedger) {
        this.prisma = prisma;
        this.customerLedger = customerLedger;
    }
    listActiveSubscriptionPlans() {
        return this.prisma.subscriptionPlan.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' },
            select: {
                id: true,
                name: true,
                salePrice: true,
                actualBalance: true,
            },
        });
    }
    async searchCustomers(query) {
        const q = query.trim();
        if (q.length < 2) {
            throw new common_1.BadRequestException('Search query must be at least 2 characters');
        }
        return this.prisma.customer.findMany({
            where: {
                OR: [
                    { phone: { contains: q, mode: 'insensitive' } },
                    { phone2: { contains: q, mode: 'insensitive' } },
                    { address: { contains: q, mode: 'insensitive' } },
                    { displayName: { contains: q, mode: 'insensitive' } },
                ],
            },
            take: 50,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                phone: true,
                phone2: true,
                displayName: true,
                address: true,
                createdAt: true,
                wallet: {
                    select: {
                        balance: true,
                        debt: true,
                    },
                },
            },
        });
    }
    async activateSubscription(userId, dto) {
        return this.prisma.$transaction(async (tx) => {
            const settlement = await this.customerLedger.activateSubscriptionPlan(tx, {
                customerId: dto.customerId,
                planId: dto.planId,
                performedByUserId: userId,
            });
            const [customer, plan, wallet] = await Promise.all([
                tx.customer.findUniqueOrThrow({
                    where: { id: dto.customerId },
                    select: {
                        id: true,
                        phone: true,
                        phone2: true,
                        address: true,
                        displayName: true,
                    },
                }),
                tx.subscriptionPlan.findUniqueOrThrow({
                    where: { id: dto.planId },
                }),
                tx.customerWallet.findUniqueOrThrow({
                    where: { customerId: dto.customerId },
                }),
            ]);
            return {
                customer,
                plan: {
                    id: plan.id,
                    name: plan.name,
                    salePrice: plan.salePrice.toString(),
                    actualBalance: plan.actualBalance.toString(),
                },
                wallet: {
                    balance: wallet.balance.toString(),
                    debt: wallet.debt.toString(),
                },
                settlement,
            };
        });
    }
    async listCustomerSettlementHistory(customerId, take = 40) {
        const customer = await this.prisma.customer.findUnique({
            where: { id: customerId },
            select: { id: true },
        });
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        const rows = await this.prisma.transactionHistory.findMany({
            where: {
                customerId,
                type: {
                    in: [
                        client_1.LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
                        client_1.LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
                    ],
                },
            },
            orderBy: { createdAt: 'desc' },
            take,
            select: {
                id: true,
                createdAt: true,
                type: true,
                balanceAfter: true,
                debtAfter: true,
                orderId: true,
                metadata: true,
            },
        });
        return rows.map((r) => {
            const meta = r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata)
                ? r.metadata
                : {};
            const str = (k) => {
                const v = meta[k];
                return typeof v === 'string' ? v : undefined;
            };
            return {
                id: r.id,
                createdAt: r.createdAt,
                type: r.type,
                totalCollected: str('totalCollected'),
                debtSettled: str('debtSettled'),
                creditedToBalance: str('creditedToBalance'),
                balanceAfter: r.balanceAfter.toString(),
                debtAfter: r.debtAfter.toString(),
                planName: str('planName'),
                orderId: r.orderId ?? undefined,
            };
        });
    }
};
exports.CallCenterService = CallCenterService;
exports.CallCenterService = CallCenterService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        customer_ledger_service_1.CustomerLedgerService])
], CallCenterService);
//# sourceMappingURL=call-center.service.js.map