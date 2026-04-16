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
        return tx.customerWallet.upsert({
            where: { customerId },
            create: { customerId },
            update: {},
        });
    }
    resolveDebtCategory(role) {
        if (role === client_1.SafariRole.OWNER)
            return client_1.DebtEntityCategory.OWNER;
        if (role === client_1.SafariRole.DRIVER)
            return client_1.DebtEntityCategory.DRIVER;
        if (role === client_1.SafariRole.CALL_CENTER)
            return client_1.DebtEntityCategory.CALL_CENTER;
        return client_1.DebtEntityCategory.BRANCH;
    }
    async ensureCustomerOriginBranchTx(tx, customerId, branchId) {
        if (!branchId)
            return;
        await tx.customer.updateMany({
            where: { id: customerId, originBranchId: null },
            data: { originBranchId: branchId },
        });
    }
    async applyOrderWalletSettlementForCompletedOrder(tx, orderId, performedByUserId, prefetch) {
        const o = prefetch ??
            (await tx.order.findUnique({
                where: { id: orderId },
                select: {
                    walletSettledAt: true,
                    customerId: true,
                    totalPrice: true,
                    posPaymentMethod: true,
                },
            }));
        if (!o) {
            throw new common_1.NotFoundException('Order not found');
        }
        if (o.walletSettledAt) {
            return;
        }
        const actor = await tx.user.findUnique({
            where: { id: performedByUserId },
            select: { id: true, safariRole: true, branchId: true },
        });
        if (!actor) {
            throw new common_1.NotFoundException('Performing user not found — cannot record wallet settlement');
        }
        await this.ensureCustomerOriginBranchTx(tx, o.customerId, actor.branchId);
        const totalMinor = (0, finance_money_1.toMinorFromFixed4)(o.totalPrice);
        if (totalMinor < 0n) {
            throw new common_1.BadRequestException('Order total cannot be negative');
        }
        const wallet = await this.getOrCreateWalletTx(tx, o.customerId);
        const balanceMinor = (0, finance_money_1.toMinorFromFixed4)(wallet.balance);
        const debtMinor = (0, finance_money_1.toMinorFromFixed4)(wallet.debt);
        const takeMinor = balanceMinor < totalMinor ? balanceMinor : totalMinor;
        const shortfallMinor = totalMinor - takeMinor;
        const beforeSubscriptionDebtMinor = balanceMinor < 0n ? -balanceMinor : 0n;
        const isSubscriptionWalletPayment = o.posPaymentMethod === client_1.PosPaymentMethod.SUBSCRIPTION_WALLET;
        const newBalanceMinor = isSubscriptionWalletPayment ? balanceMinor - totalMinor : balanceMinor - takeMinor;
        const externalCoversShortfall = o.posPaymentMethod === client_1.PosPaymentMethod.CASH ||
            o.posPaymentMethod === client_1.PosPaymentMethod.KNET ||
            o.posPaymentMethod === client_1.PosPaymentMethod.ONLINE ||
            o.posPaymentMethod === client_1.PosPaymentMethod.PAYMENT_LINK;
        const addInvoiceDebt = o.posPaymentMethod === client_1.PosPaymentMethod.DEBT_ON_ACCOUNT ||
            (!isSubscriptionWalletPayment && !externalCoversShortfall);
        const newDebtMinor = addInvoiceDebt && shortfallMinor > 0n ? debtMinor + shortfallMinor : debtMinor;
        const afterSubscriptionDebtMinor = newBalanceMinor < 0n ? -newBalanceMinor : 0n;
        const addedSubscriptionDebtMinor = afterSubscriptionDebtMinor > beforeSubscriptionDebtMinor
            ? afterSubscriptionDebtMinor - beforeSubscriptionDebtMinor
            : 0n;
        const addedInvoiceDebtMinor = addInvoiceDebt && shortfallMinor > 0n ? shortfallMinor : 0n;
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
                    addedToDebt: (0, finance_money_1.minorToAmountString)(addedInvoiceDebtMinor),
                    addedSubscriptionDebt: (0, finance_money_1.minorToAmountString)(addedSubscriptionDebtMinor),
                    posPaymentMethod: o.posPaymentMethod ?? null,
                    externalCoversShortfall: externalCoversShortfall && shortfallMinor > 0n ? true : false,
                    reportingCategory: 'DAILY_SALES',
                },
            },
        });
        const debtCategory = this.resolveDebtCategory(actor.safariRole);
        if (addedInvoiceDebtMinor > 0n) {
            await tx.debtLedgerEntry.create({
                data: {
                    customerId: o.customerId,
                    orderId,
                    source: client_1.DebtSource.INVOICE_SHORTFALL,
                    category: debtCategory,
                    amount: this.decimalFromMinor(addedInvoiceDebtMinor),
                    branchId: actor.branchId,
                    actorUserId: actor.id,
                    note: 'Invoice shortfall recorded as receivable',
                },
            });
        }
        if (addedSubscriptionDebtMinor > 0n) {
            await tx.debtLedgerEntry.create({
                data: {
                    customerId: o.customerId,
                    orderId,
                    source: client_1.DebtSource.SUBSCRIPTION_OVERUSE,
                    category: debtCategory,
                    amount: this.decimalFromMinor(addedSubscriptionDebtMinor),
                    branchId: actor.branchId,
                    actorUserId: actor.id,
                    note: 'Subscription balance allowed to go negative',
                },
            });
        }
        await tx.order.updateMany({
            where: { id: orderId, walletSettledAt: null },
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
            select: { id: true, originBranchId: true },
        });
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        const wallet = await this.getOrCreateWalletTx(tx, params.customerId);
        const actor = await tx.user.findUnique({
            where: { id: params.performedByUserId },
            select: { id: true, branchId: true },
        });
        if (!actor) {
            throw new common_1.NotFoundException('Performing user not found');
        }
        await this.ensureCustomerOriginBranchTx(tx, params.customerId, actor.branchId);
        const refreshedCustomer = await tx.customer.findUnique({
            where: { id: params.customerId },
            select: { originBranchId: true },
        });
        const subsidyBranchId = refreshedCustomer?.originBranchId ?? actor.branchId ?? null;
        const balanceMinor = (0, finance_money_1.toMinorFromFixed4)(wallet.balance);
        const debtMinor = (0, finance_money_1.toMinorFromFixed4)(wallet.debt);
        const priceMinor = (0, finance_money_1.toMinorFromFixed4)(plan.salePrice);
        const creditMinor = (0, finance_money_1.toMinorFromFixed4)(plan.actualBalance);
        if (priceMinor < 0n || creditMinor < 0n) {
            throw new common_1.BadRequestException('Plan price and credit amount must be non-negative');
        }
        const debtPaidMinor = debtMinor < priceMinor ? debtMinor : priceMinor;
        const newDebtMinor = debtMinor - debtPaidMinor;
        const rawCreditMinor = creditMinor - debtPaidMinor;
        const balanceIncreaseMinor = rawCreditMinor > 0n ? rawCreditMinor : 0n;
        const newBalanceMinor = balanceMinor + balanceIncreaseMinor;
        const activatedAt = new Date();
        const validityDays = plan.validityDays > 0 ? plan.validityDays : 30;
        const subscriptionExpiresAt = new Date(activatedAt.getTime());
        subscriptionExpiresAt.setUTCDate(subscriptionExpiresAt.getUTCDate() + validityDays);
        await tx.customerWallet.update({
            where: { id: wallet.id },
            data: {
                balance: this.decimalFromMinor(newBalanceMinor),
                debt: this.decimalFromMinor(newDebtMinor),
                subscriptionActivatedAt: activatedAt,
                subscriptionExpiresAt,
                subscriptionPlanId: plan.id,
                subscriptionPlanName: plan.name,
            },
        });
        const totalCollectedStr = (0, finance_money_1.minorToAmountString)(priceMinor);
        const debtSettledStr = (0, finance_money_1.minorToAmountString)(debtPaidMinor);
        const creditedStr = (0, finance_money_1.minorToAmountString)(balanceIncreaseMinor);
        const subsidyMinor = creditMinor > priceMinor ? creditMinor - priceMinor : 0n;
        const subsidyStr = (0, finance_money_1.minorToAmountString)(subsidyMinor);
        await tx.transactionHistory.create({
            data: {
                type: client_1.LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
                customerId: params.customerId,
                amount: plan.actualBalance,
                balanceBefore: wallet.balance,
                balanceAfter: this.decimalFromMinor(newBalanceMinor),
                debtBefore: wallet.debt,
                debtAfter: this.decimalFromMinor(newDebtMinor),
                performedById: params.performedByUserId,
                metadata: {
                    planId: plan.id,
                    planName: plan.name,
                    salePrice: plan.salePrice.toString(),
                    actualBalance: plan.actualBalance.toString(),
                    totalCollected: totalCollectedStr,
                    debtSettled: debtSettledStr,
                    creditedToBalance: creditedStr,
                    subsidy: subsidyStr,
                    subsidyBranchId,
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