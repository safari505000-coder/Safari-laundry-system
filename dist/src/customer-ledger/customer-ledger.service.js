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
const general_ledger_service_1 = require("../general-ledger/general-ledger.service");
const prisma_service_1 = require("../prisma/prisma.service");
let CustomerLedgerService = class CustomerLedgerService {
    prisma;
    generalLedger;
    constructor(prisma, generalLedger) {
        this.prisma = prisma;
        this.generalLedger = generalLedger;
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
    async applyOrderWalletSettlementForCompletedOrder(tx, orderId, performedByUserId, prefetch, extraMetadata) {
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
        const activeSubscription = await tx.customerSubscription.findFirst({
            where: {
                customerId: o.customerId,
                status: client_1.CustomerSubscriptionStatus.ACTIVE,
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
        });
        if (activeSubscription) {
            await tx.order.update({
                where: { id: orderId },
                data: { subscriptionId: activeSubscription.id },
            });
        }
        await tx.transactionHistory.create({
            data: {
                type: client_1.LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
                customerId: o.customerId,
                orderId,
                subscriptionId: activeSubscription?.id ?? null,
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
                    subscriptionId: activeSubscription?.id ?? null,
                    ...(extraMetadata ?? {}),
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
            await this.generalLedger.append(tx, {
                entryType: client_1.GeneralLedgerEntryType.DEBT_ADJUSTMENT,
                amount: this.decimalFromMinor(addedInvoiceDebtMinor),
                memo: 'Invoice shortfall recorded as receivable',
                customerId: o.customerId,
                orderId,
                actorUserId: actor.id,
                metadata: {
                    source: client_1.DebtSource.INVOICE_SHORTFALL,
                    category: debtCategory,
                    branchId: actor.branchId,
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
            await this.generalLedger.append(tx, {
                entryType: client_1.GeneralLedgerEntryType.DEBT_ADJUSTMENT,
                amount: this.decimalFromMinor(addedSubscriptionDebtMinor),
                memo: 'Subscription balance allowed to go negative',
                customerId: o.customerId,
                orderId,
                actorUserId: actor.id,
                metadata: {
                    source: client_1.DebtSource.SUBSCRIPTION_OVERUSE,
                    category: debtCategory,
                    branchId: actor.branchId,
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
        const previousSubscription = await tx.customerSubscription.findFirst({
            where: {
                customerId: params.customerId,
                status: {
                    in: [
                        client_1.CustomerSubscriptionStatus.ACTIVE,
                        client_1.CustomerSubscriptionStatus.EXPIRED,
                    ],
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        const carriedBalanceMinor = balanceMinor - debtMinor;
        const carriedBalanceStr = (0, finance_money_1.minorToAmountString)(carriedBalanceMinor);
        const carriedBalanceDecimal = new client_1.Prisma.Decimal(carriedBalanceStr);
        const newSubscription = await tx.customerSubscription.create({
            data: {
                customerId: params.customerId,
                planId: plan.id,
                status: client_1.CustomerSubscriptionStatus.ACTIVE,
                planNameSnapshot: plan.name,
                planSalePriceSnapshot: plan.salePrice,
                planActualBalanceSnapshot: plan.actualBalance,
                planValidityDaysSnapshot: validityDays,
                carriedBalanceKd: carriedBalanceDecimal,
                parentSubscriptionId: previousSubscription?.id ?? null,
                activatedAt,
                expiresAt: subscriptionExpiresAt,
            },
        });
        if (previousSubscription) {
            await tx.customerSubscription.update({
                where: { id: previousSubscription.id },
                data: {
                    status: client_1.CustomerSubscriptionStatus.ROLLED_OVER,
                    closedAt: activatedAt,
                    closedReason: 'ROLLOVER',
                },
            });
        }
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
                subscriptionId: newSubscription.id,
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
                    rolledOverFromSubscriptionId: previousSubscription?.id ?? null,
                    carriedBalanceKd: carriedBalanceStr,
                },
            },
        });
        if (debtPaidMinor > 0n) {
            await this.generalLedger.append(tx, {
                entryType: client_1.GeneralLedgerEntryType.DEBT_ADJUSTMENT,
                amount: `-${debtSettledStr}`,
                memo: 'Subscription activation settled existing debt',
                customerId: params.customerId,
                actorUserId: params.performedByUserId,
                metadata: {
                    event: 'DEBT_SETTLED',
                    source: 'SUBSCRIPTION_ACTIVATION',
                    planId: plan.id,
                    planName: plan.name,
                    subsidyBranchId,
                    subscriptionId: newSubscription.id,
                    rolledOverFromSubscriptionId: previousSubscription?.id ?? null,
                },
            });
        }
        return {
            totalCollected: totalCollectedStr,
            debtSettled: debtSettledStr,
            creditedToBalance: creditedStr,
            previousBalance: wallet.balance.toString(),
            previousDebt: wallet.debt.toString(),
            newBalance: (0, finance_money_1.minorToAmountString)(newBalanceMinor),
            newDebt: (0, finance_money_1.minorToAmountString)(newDebtMinor),
            subscriptionId: newSubscription.id,
            rolledOverFromSubscriptionId: previousSubscription?.id ?? null,
            carriedBalanceKd: carriedBalanceStr,
        };
    }
    async recordPartialDebtPayment(params) {
        return this.prisma.$transaction(async (tx) => {
            const customer = await tx.customer.findUnique({
                where: { id: params.customerId },
                select: { id: true, originBranchId: true },
            });
            if (!customer) {
                throw new common_1.NotFoundException('Customer not found');
            }
            const actor = await tx.user.findUnique({
                where: { id: params.performedByUserId },
                select: { id: true, safariRole: true, branchId: true },
            });
            if (!actor) {
                throw new common_1.NotFoundException('Performing user not found');
            }
            const wallet = await this.getOrCreateWalletTx(tx, params.customerId);
            const amountMinor = (0, finance_money_1.toMinorFromFixed4)(new client_1.Prisma.Decimal(params.amountKd));
            const discountMinor = params.discountKd !== undefined
                ? (0, finance_money_1.toMinorFromFixed4)(new client_1.Prisma.Decimal(params.discountKd))
                : 0n;
            const totalMinor = amountMinor + discountMinor;
            const debtMinor = (0, finance_money_1.toMinorFromFixed4)(wallet.debt);
            if (amountMinor < 0n || discountMinor < 0n) {
                throw new common_1.BadRequestException('Amount and discount must both be non-negative');
            }
            if (totalMinor === 0n) {
                throw new common_1.BadRequestException('At least one of amount or discount must be greater than zero');
            }
            if (totalMinor > debtMinor) {
                throw new common_1.BadRequestException('Amount + discount cannot exceed current customer debt');
            }
            const newDebtMinor = debtMinor - totalMinor;
            const amountStr = (0, finance_money_1.minorToAmountString)(amountMinor);
            const discountStr = (0, finance_money_1.minorToAmountString)(discountMinor);
            const totalStr = (0, finance_money_1.minorToAmountString)(totalMinor);
            const newDebtStr = (0, finance_money_1.minorToAmountString)(newDebtMinor);
            await tx.customerWallet.update({
                where: { id: wallet.id },
                data: { debt: this.decimalFromMinor(newDebtMinor) },
            });
            await tx.transactionHistory.create({
                data: {
                    type: client_1.LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
                    customerId: params.customerId,
                    orderId: null,
                    subscriptionId: null,
                    amount: this.decimalFromMinor(totalMinor),
                    balanceBefore: wallet.balance,
                    balanceAfter: wallet.balance,
                    debtBefore: wallet.debt,
                    debtAfter: this.decimalFromMinor(newDebtMinor),
                    performedById: params.performedByUserId,
                    metadata: {
                        debtPaymentOnly: true,
                        debtSettled: amountStr,
                        debtDiscount: discountStr,
                        debtReduced: totalStr,
                        posPaymentMethod: params.paymentMethod,
                        reportingCategory: 'DEBT_COLLECTION_CC',
                        note: params.note ?? null,
                    },
                },
            });
            const branchId = customer.originBranchId ?? actor.branchId ?? null;
            const category = this.resolveDebtCategory(actor.safariRole);
            if (amountMinor > 0n) {
                await this.generalLedger.append(tx, {
                    entryType: client_1.GeneralLedgerEntryType.DEBT_ADJUSTMENT,
                    amount: `-${amountStr}`,
                    memo: 'Partial debt payment collected via Call Center',
                    customerId: params.customerId,
                    actorUserId: params.performedByUserId,
                    metadata: {
                        event: 'DEBT_COLLECTED',
                        source: 'CC_PARTIAL_DEBT_PAYMENT',
                        posPaymentMethod: params.paymentMethod,
                        category,
                        branchId,
                        note: params.note ?? null,
                    },
                });
            }
            if (discountMinor > 0n) {
                await this.generalLedger.append(tx, {
                    entryType: client_1.GeneralLedgerEntryType.DEBT_ADJUSTMENT,
                    amount: `-${discountStr}`,
                    memo: 'Goodwill debt discount granted via Call Center',
                    customerId: params.customerId,
                    actorUserId: params.performedByUserId,
                    metadata: {
                        event: 'DEBT_DISCOUNTED',
                        source: 'CC_PARTIAL_DEBT_PAYMENT',
                        category,
                        branchId,
                        note: params.note ?? null,
                    },
                });
            }
            return {
                amountCollectedKd: amountStr,
                discountAppliedKd: discountStr,
                totalReducedKd: totalStr,
                previousDebtKd: wallet.debt.toString(),
                newDebtKd: newDebtStr,
                walletBalanceKd: wallet.balance.toString(),
                paymentMethod: params.paymentMethod,
            };
        }, { maxWait: 10_000, timeout: 15_000 });
    }
};
exports.CustomerLedgerService = CustomerLedgerService;
exports.CustomerLedgerService = CustomerLedgerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        general_ledger_service_1.GeneralLedgerService])
], CustomerLedgerService);
//# sourceMappingURL=customer-ledger.service.js.map