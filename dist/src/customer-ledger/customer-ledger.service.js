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
exports.CustomerLedgerService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const finance_money_1 = require("../finance/finance-money");
const prisma_service_1 = require("../prisma/prisma.service");
let CustomerLedgerService = class CustomerLedgerService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    decimalFromMinor(minor) {
        return new client_1.Prisma.Decimal((0, finance_money_1.minorToAmountString)(minor));
    }
    async getOrCreateWalletTx(tx, customerId) {
        let w = await tx.customerWallet.findUnique({ where: { customerId } });
        if (!w) {
            w = await tx.customerWallet.create({
                data: { customerId },
            });
        }
        return w;
    }
    async applyOrderWalletSettlementForCompletedOrder(tx, orderId, performedByUserId) {
        const o = await tx.order.findUnique({
            where: { id: orderId },
            select: {
                walletSettledAt: true,
                customerId: true,
                totalPrice: true,
                posPaymentMethod: true,
            },
        });
        if (!o) {
            throw new common_1.NotFoundException('Order not found');
        }
        if (o.walletSettledAt) {
            return;
        }
        const totalMinor = (0, finance_money_1.toMinorFromFixed4)(o.totalPrice);
        if (totalMinor < 0n) {
            throw new common_1.BadRequestException('Order total cannot be negative');
        }
        const wallet = await this.getOrCreateWalletTx(tx, o.customerId);
        const balanceMinor = (0, finance_money_1.toMinorFromFixed4)(wallet.balance);
        const debtMinor = (0, finance_money_1.toMinorFromFixed4)(wallet.debt);
        const takeMinor = balanceMinor < totalMinor ? balanceMinor : totalMinor;
        const shortfallMinor = totalMinor - takeMinor;
        const newBalanceMinor = balanceMinor - takeMinor;
        const externalCoversShortfall = o.posPaymentMethod === client_1.PosPaymentMethod.CASH ||
            o.posPaymentMethod === client_1.PosPaymentMethod.KNET ||
            o.posPaymentMethod === client_1.PosPaymentMethod.PAYMENT_LINK;
        const newDebtMinor = externalCoversShortfall && shortfallMinor > 0n ?
            debtMinor
            : debtMinor + shortfallMinor;
        await tx.customerWallet.update({
            where: { id: wallet.id },
            data: {
                balance: this.decimalFromMinor(newBalanceMinor),
                debt: this.decimalFromMinor(newDebtMinor),
            },
        });
        await tx.transactionHistory.create({
            data: {
                type: client_1.LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
                customerId: o.customerId,
                orderId,
                amount: o.totalPrice,
                balanceBefore: wallet.balance,
                balanceAfter: this.decimalFromMinor(newBalanceMinor),
                debtBefore: wallet.debt,
                debtAfter: this.decimalFromMinor(newDebtMinor),
                performedById: performedByUserId,
                metadata: {
                    appliedFromWallet: (0, finance_money_1.minorToAmountString)(takeMinor),
                    orderTotal: o.totalPrice.toString(),
                    addedToDebt: (0, finance_money_1.minorToAmountString)(externalCoversShortfall && shortfallMinor > 0n ? 0n : shortfallMinor),
                    posPaymentMethod: o.posPaymentMethod ?? null,
                    externalCoversShortfall: externalCoversShortfall && shortfallMinor > 0n ? true : false,
                    reportingCategory: 'DAILY_SALES',
                },
            },
        });
        await tx.order.update({
            where: { id: orderId },
            data: { walletSettledAt: new Date() },
        });
    }
    async activateSubscriptionPlan(tx, params) {
        const plan = await tx.subscriptionPlan.findUnique({
            where: { id: params.planId },
        });
        if (!plan) {
            throw new common_1.NotFoundException('Subscription plan not found');
        }
        if (!plan.isActive) {
            throw new common_1.BadRequestException('This subscription plan is not active');
        }
        const customer = await tx.customer.findUnique({
            where: { id: params.customerId },
        });
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        const wallet = await this.getOrCreateWalletTx(tx, params.customerId);
        const balanceMinor = (0, finance_money_1.toMinorFromFixed4)(wallet.balance);
        const debtMinor = (0, finance_money_1.toMinorFromFixed4)(wallet.debt);
        const priceMinor = (0, finance_money_1.toMinorFromFixed4)(plan.price);
        const creditMinor = (0, finance_money_1.toMinorFromFixed4)(plan.creditAmount);
        if (priceMinor < 0n || creditMinor < 0n) {
            throw new common_1.BadRequestException('Plan price and credit amount must be non-negative');
        }
        const debtPaidMinor = debtMinor < priceMinor ? debtMinor : priceMinor;
        const newDebtMinor = debtMinor - debtPaidMinor;
        const rawCreditMinor = creditMinor - debtPaidMinor;
        const balanceIncreaseMinor = rawCreditMinor > 0n ? rawCreditMinor : 0n;
        const newBalanceMinor = balanceMinor + balanceIncreaseMinor;
        await tx.customerWallet.update({
            where: { id: wallet.id },
            data: {
                balance: this.decimalFromMinor(newBalanceMinor),
                debt: this.decimalFromMinor(newDebtMinor),
            },
        });
        const totalCollectedStr = (0, finance_money_1.minorToAmountString)(priceMinor);
        const debtSettledStr = (0, finance_money_1.minorToAmountString)(debtPaidMinor);
        const creditedStr = (0, finance_money_1.minorToAmountString)(balanceIncreaseMinor);
        await tx.transactionHistory.create({
            data: {
                type: client_1.LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
                customerId: params.customerId,
                amount: plan.creditAmount,
                balanceBefore: wallet.balance,
                balanceAfter: this.decimalFromMinor(newBalanceMinor),
                debtBefore: wallet.debt,
                debtAfter: this.decimalFromMinor(newDebtMinor),
                performedById: params.performedByUserId,
                metadata: {
                    planId: plan.id,
                    planName: plan.name,
                    planPrice: plan.price.toString(),
                    creditAmount: plan.creditAmount.toString(),
                    totalCollected: totalCollectedStr,
                    debtSettled: debtSettledStr,
                    creditedToBalance: creditedStr,
                    automaticDebtSettlement: true,
                },
            },
        });
        return {
            totalCollected: totalCollectedStr,
            debtSettled: debtSettledStr,
            creditedToBalance: creditedStr,
            previousBalance: wallet.balance.toString(),
            previousDebt: wallet.debt.toString(),
            newBalance: (0, finance_money_1.minorToAmountString)(newBalanceMinor),
            newDebt: (0, finance_money_1.minorToAmountString)(newDebtMinor),
        };
    }
};
exports.CustomerLedgerService = CustomerLedgerService;
exports.CustomerLedgerService = CustomerLedgerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CustomerLedgerService);
//# sourceMappingURL=customer-ledger.service.js.map