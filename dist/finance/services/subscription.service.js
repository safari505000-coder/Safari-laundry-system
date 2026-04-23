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
exports.SubscriptionService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../../prisma/prisma.service");
let SubscriptionService = class SubscriptionService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getUsageAndSettledDebtTotals() {
        const txRows = await this.prisma.transactionHistory.findMany({
            where: {
                OR: [
                    { type: client_1.LedgerTransactionType.ORDER_WALLET_SETTLEMENT },
                    { type: client_1.LedgerTransactionType.SUBSCRIPTION_ACTIVATION },
                ],
            },
            select: { type: true, metadata: true },
        });
        let usage = 0;
        let settled = 0;
        for (const row of txRows) {
            const meta = row.metadata;
            if (row.type === client_1.LedgerTransactionType.ORDER_WALLET_SETTLEMENT) {
                const n = Number.parseFloat(String(meta?.appliedFromWallet ?? '0'));
                if (Number.isFinite(n) && n > 0)
                    usage += n;
            }
            else if (row.type === client_1.LedgerTransactionType.SUBSCRIPTION_ACTIVATION) {
                const n = Number.parseFloat(String(meta?.debtSettled ?? '0'));
                if (Number.isFinite(n) && n > 0)
                    settled += n;
            }
        }
        return {
            totalSubscriptionUsage: usage.toFixed(4),
            debtSettledBySubscriptions: settled.toFixed(4),
        };
    }
    async getCustomerSubscriptionSnapshot(customerId) {
        const wallet = await this.prisma.customerWallet.findUnique({
            where: { customerId },
            select: {
                balance: true,
                subscriptionPlanId: true,
                subscriptionPlanName: true,
                subscriptionActivatedAt: true,
                subscriptionExpiresAt: true,
            },
        });
        const txRows = await this.prisma.transactionHistory.findMany({
            where: {
                customerId,
                OR: [
                    { type: client_1.LedgerTransactionType.ORDER_WALLET_SETTLEMENT },
                    { type: client_1.LedgerTransactionType.SUBSCRIPTION_ACTIVATION },
                ],
            },
            select: { type: true, metadata: true },
            take: 5000,
        });
        let usage = 0;
        let settled = 0;
        for (const row of txRows) {
            const meta = row.metadata;
            if (row.type === client_1.LedgerTransactionType.ORDER_WALLET_SETTLEMENT) {
                const n = Number.parseFloat(String(meta?.appliedFromWallet ?? '0'));
                if (Number.isFinite(n) && n > 0)
                    usage += n;
            }
            else if (row.type === client_1.LedgerTransactionType.SUBSCRIPTION_ACTIVATION) {
                const n = Number.parseFloat(String(meta?.debtSettled ?? '0'));
                if (Number.isFinite(n) && n > 0)
                    settled += n;
            }
        }
        return {
            walletBalance: wallet?.balance?.toString?.() ?? '0.0000',
            subscriptionPlanId: wallet?.subscriptionPlanId ?? null,
            subscriptionPlanName: wallet?.subscriptionPlanName ?? null,
            subscriptionActivatedAt: wallet?.subscriptionActivatedAt?.toISOString() ?? null,
            subscriptionExpiresAt: wallet?.subscriptionExpiresAt?.toISOString() ?? null,
            totalSubscriptionUsage: usage.toFixed(4),
            debtSettledBySubscriptions: settled.toFixed(4),
        };
    }
};
exports.SubscriptionService = SubscriptionService;
exports.SubscriptionService = SubscriptionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SubscriptionService);
//# sourceMappingURL=subscription.service.js.map