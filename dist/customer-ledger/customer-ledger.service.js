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
var CustomerLedgerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerLedgerService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const cash_status_for_method_1 = require("../common/utils/cash-status-for-method");
const finance_money_1 = require("../finance/finance-money");
const general_ledger_service_1 = require("../general-ledger/general-ledger.service");
const inventory_service_1 = require("../inventory/inventory.service");
const prisma_service_1 = require("../prisma/prisma.service");
let CustomerLedgerService = CustomerLedgerService_1 = class CustomerLedgerService {
    prisma;
    generalLedger;
    inventory;
    logger = new common_1.Logger(CustomerLedgerService_1.name);
    constructor(prisma, generalLedger, inventory) {
        this.prisma = prisma;
        this.generalLedger = generalLedger;
        this.inventory = inventory;
    }
    async sumUnsettledUnpaidReceivableMinorTx(tx, customerId) {
        const agg = await tx.order.aggregate({
            where: {
                customerId,
                cashStatus: client_1.CashStatus.UNPAID,
                status: { not: client_1.OrderStatus.CANCELED },
                walletSettledAt: null,
            },
            _sum: { totalPrice: true },
        });
        return (0, finance_money_1.toMinorFromFixed4)(agg._sum.totalPrice ?? new client_1.Prisma.Decimal(0));
    }
    async resolveFallbackOwnerIdTx(tx) {
        const owner = await tx.user.findFirst({
            where: { safariRole: client_1.SafariRole.OWNER },
            select: { id: true },
            orderBy: { createdAt: 'asc' },
        });
        return owner?.id ?? null;
    }
    async autoReconcileUnpaidInvoicesFromPrepaidBalanceTx(tx, customerId, performedByUserId) {
        const paidOrderIds = [];
        const performerId = performedByUserId ?? (await this.resolveFallbackOwnerIdTx(tx));
        if (!performerId) {
            this.logger.warn(`[prepaid-auto-reconcile] No OWNER user to attribute ledger — skip customerId=${customerId}`);
            return { paidOrderIds };
        }
        const maxPasses = 50;
        for (let pass = 0; pass < maxPasses; pass++) {
            const wallet = await this.getOrCreateWalletTx(tx, customerId);
            const balanceMinor = (0, finance_money_1.toMinorFromFixed4)(wallet.balance);
            if (balanceMinor <= 0n)
                break;
            const next = await tx.order.findFirst({
                where: {
                    customerId,
                    cashStatus: client_1.CashStatus.UNPAID,
                    status: { not: client_1.OrderStatus.CANCELED },
                    walletSettledAt: null,
                    posPaymentBundleId: null,
                },
                orderBy: { createdAt: 'asc' },
                select: {
                    id: true,
                    totalPrice: true,
                    status: true,
                    completedAt: true,
                    driverId: true,
                    customerId: true,
                },
            });
            if (!next)
                break;
            const invMinor = (0, finance_money_1.toMinorFromFixed4)(next.totalPrice);
            if (invMinor <= 0n)
                break;
            if (invMinor > balanceMinor)
                break;
            const wasIncomplete = next.status !== client_1.OrderStatus.COMPLETED;
            await tx.order.update({
                where: { id: next.id },
                data: {
                    status: client_1.OrderStatus.COMPLETED,
                    completedAt: next.completedAt ?? new Date(),
                    posPaymentMethod: client_1.PosPaymentMethod.SUBSCRIPTION_WALLET,
                    cashStatus: (0, cash_status_for_method_1.cashStatusForPaymentMethod)(client_1.PosPaymentMethod.SUBSCRIPTION_WALLET),
                },
            });
            await this.applyOrderWalletSettlementForCompletedOrder(tx, next.id, performerId, {
                customerId: next.customerId,
                totalPrice: next.totalPrice,
                posPaymentMethod: client_1.PosPaymentMethod.SUBSCRIPTION_WALLET,
                walletSettledAt: null,
                skipPerformerLookup: true,
            }, {
                autoReconciledFromPrepaidBalance: true,
                reportingCategory: 'PREPAID_AUTO_RECONCILE',
            });
            if (wasIncomplete) {
                await this.generalLedger.append(tx, {
                    entryType: client_1.GeneralLedgerEntryType.POS_SALE_COMPLETED,
                    amount: next.totalPrice,
                    memo: 'POS checkout (prepaid auto-reconcile)',
                    orderId: next.id,
                    customerId: next.customerId,
                    actorUserId: performerId,
                    metadata: {
                        posPaymentMethod: client_1.PosPaymentMethod.SUBSCRIPTION_WALLET,
                        source: 'PREPAID_AUTO_RECONCILE',
                    },
                });
                const actorRow = await tx.user.findUnique({
                    where: { id: performerId },
                    select: { branchId: true },
                });
                const driverRow = next.driverId
                    ? await tx.user.findUnique({
                        where: { id: next.driverId },
                        select: { branchId: true },
                    })
                    : null;
                await this.inventory.applyOrderStockDecrement(tx, {
                    orderId: next.id,
                    actorUserId: performerId,
                    branchId: driverRow?.branchId ?? actorRow?.branchId ?? null,
                    reference: `AUTO-PREPAID-${next.id.slice(0, 8)}`,
                });
            }
            paidOrderIds.push(next.id);
        }
        if (paidOrderIds.length > 0) {
            this.logger.log(`[prepaid-auto-reconcile] customerId=${customerId} count=${paidOrderIds.length} orderIds=${paidOrderIds.join(',')}`);
        }
        return { paidOrderIds };
    }
    async runPrepaidAutoReconcileForCustomer(customerId, performedByUserId) {
        return this.prisma.$transaction(async (tx) => this.autoReconcileUnpaidInvoicesFromPrepaidBalanceTx(tx, customerId, performedByUserId ?? null), { maxWait: 15_000, timeout: 45_000 });
    }
    decimalFromMinor(minor) {
        return new client_1.Prisma.Decimal((0, finance_money_1.minorToAmountString)(minor));
    }
    async getOrCreateWalletTx(tx, customerId) {
        try {
            return await tx.customerWallet.upsert({
                where: { customerId },
                create: { customerId },
                update: {},
            });
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError &&
                e.code === 'P2002') {
                return tx.customerWallet.findUniqueOrThrow({
                    where: { customerId },
                });
            }
            throw e;
        }
    }
    resolveDebtCategory(role) {
        if (role === client_1.SafariRole.OWNER)
            return client_1.DebtEntityCategory.OWNER;
        if (role === client_1.SafariRole.DRIVER)
            return client_1.DebtEntityCategory.DRIVER;
        if (role === client_1.SafariRole.CALL_CENTER ||
            role === client_1.SafariRole.CALL_CENTER_SUPERVISOR)
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
        let newDebtMinor = addInvoiceDebt && shortfallMinor > 0n ? debtMinor + shortfallMinor : debtMinor;
        const debtSettledRawEarly = extraMetadata !== undefined ? extraMetadata.debtSettled : null;
        let debtPaydownFromSettlementMinor = 0n;
        const debtSettledStr = typeof debtSettledRawEarly === 'string' && debtSettledRawEarly.trim()
            ? debtSettledRawEarly.trim()
            : typeof debtSettledRawEarly === 'number' &&
                Number.isFinite(debtSettledRawEarly)
                ? String(debtSettledRawEarly)
                : null;
        if (debtSettledStr) {
            const declaredSettledMinor = (0, finance_money_1.toMinorFromFixed4)(new client_1.Prisma.Decimal(debtSettledStr));
            if (declaredSettledMinor > 0n && newDebtMinor > 0n) {
                debtPaydownFromSettlementMinor =
                    declaredSettledMinor < newDebtMinor
                        ? declaredSettledMinor
                        : newDebtMinor;
                newDebtMinor -= debtPaydownFromSettlementMinor;
            }
        }
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
                    ...(debtPaydownFromSettlementMinor > 0n
                        ? {
                            debtPaydownFromSettlement: (0, finance_money_1.minorToAmountString)(debtPaydownFromSettlementMinor),
                        }
                        : {}),
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
        if (debtPaydownFromSettlementMinor > 0n) {
            await tx.debtLedgerEntry.create({
                data: {
                    customerId: o.customerId,
                    orderId,
                    source: client_1.DebtSource.PAYMENT,
                    category: debtCategory,
                    amount: this.decimalFromMinor(debtPaydownFromSettlementMinor),
                    branchId: actor.branchId,
                    actorUserId: actor.id,
                    note: 'Invoice debt settled (wallet settlement)',
                },
            });
            await this.generalLedger.append(tx, {
                entryType: client_1.GeneralLedgerEntryType.DEBT_ADJUSTMENT,
                amount: `-${(0, finance_money_1.minorToAmountString)(debtPaydownFromSettlementMinor)}`,
                memo: 'Debt payment recorded on unified ledger',
                customerId: o.customerId,
                orderId,
                actorUserId: actor.id,
                metadata: {
                    source: client_1.DebtSource.PAYMENT,
                    category: debtCategory,
                    branchId: actor.branchId,
                    trigger: extraMetadata?.debtSettlementViaCallCenter === true
                        ? 'CALL_CENTER_MANUAL'
                        : extraMetadata?.debtSettlementViaLink === true
                            ? 'PAYMENT_LINK_CALLBACK'
                            : 'WALLET_SETTLEMENT',
                    declaredDebtSettled: debtSettledStr,
                },
            });
        }
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
            select: { id: true, branchId: true, safariRole: true },
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
        const implicitReceivableMinor = await this.sumUnsettledUnpaidReceivableMinorTx(tx, params.customerId);
        const effectiveDebtMinor = debtMinor + implicitReceivableMinor;
        const priceMinor = (0, finance_money_1.toMinorFromFixed4)(plan.salePrice);
        const creditMinor = (0, finance_money_1.toMinorFromFixed4)(plan.actualBalance);
        if (priceMinor < 0n || creditMinor < 0n) {
            throw new common_1.BadRequestException('Plan price and credit amount must be non-negative');
        }
        if (priceMinor === 0n && creditMinor === 0n) {
            throw new common_1.BadRequestException(`Subscription plan "${plan.name}" is misconfigured: both sale price and credit amount are 0. Ask the Owner to set them in Subscription Plans before activating.`);
        }
        const debtPaidMinor = effectiveDebtMinor < creditMinor ? effectiveDebtMinor : creditMinor;
        const newDebtMinor = debtMinor - (debtPaidMinor < debtMinor ? debtPaidMinor : debtMinor);
        this.logger.log(`[subscription-activation] customerId=${params.customerId} planId=${params.planId} ` +
            `walletDebtMinor=${debtMinor.toString()} implicitUnpostedMinor=${implicitReceivableMinor.toString()} ` +
            `effectiveDebtMinor=${effectiveDebtMinor.toString()} planCreditMinor=${creditMinor.toString()} ` +
            `debtPaidMinor=${debtPaidMinor.toString()} autoCloseInvoices=${params.autoCloseInvoices === true}`);
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
                    implicitUnpostedReceivableKd: (0, finance_money_1.minorToAmountString)(implicitReceivableMinor),
                    effectiveDebtForActivationKd: (0, finance_money_1.minorToAmountString)(effectiveDebtMinor),
                },
            },
        });
        const closedInvoiceIds = [];
        if (params.autoCloseInvoices === true && debtPaidMinor > 0n) {
            const candidates = await tx.order.findMany({
                where: {
                    customerId: params.customerId,
                    cashStatus: client_1.CashStatus.UNPAID,
                    status: { not: client_1.OrderStatus.CANCELED },
                },
                select: { id: true, totalPrice: true },
                orderBy: { createdAt: 'asc' },
            });
            let remainingMinor = debtPaidMinor;
            for (const inv of candidates) {
                if (remainingMinor <= 0n)
                    break;
                const invMinor = (0, finance_money_1.toMinorFromFixed4)(inv.totalPrice);
                if (invMinor <= 0n)
                    continue;
                if (invMinor > remainingMinor)
                    continue;
                await tx.order.update({
                    where: { id: inv.id },
                    data: { cashStatus: client_1.CashStatus.PAID_TO_DRIVER },
                });
                closedInvoiceIds.push(inv.id);
                remainingMinor -= invMinor;
            }
        }
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
                    autoClosedInvoiceIds: closedInvoiceIds,
                    autoClosedInvoiceCount: closedInvoiceIds.length,
                },
            });
            const category = this.resolveDebtCategory(actor.safariRole);
            let coveredMinor = 0n;
            for (const invoiceId of closedInvoiceIds) {
                const inv = await tx.order.findUnique({
                    where: { id: invoiceId },
                    select: { totalPrice: true },
                });
                if (!inv)
                    continue;
                const invMinor = (0, finance_money_1.toMinorFromFixed4)(inv.totalPrice);
                await tx.debtLedgerEntry.create({
                    data: {
                        customerId: params.customerId,
                        orderId: invoiceId,
                        source: client_1.DebtSource.PAYMENT,
                        category,
                        amount: inv.totalPrice,
                        branchId: subsidyBranchId,
                        actorUserId: params.performedByUserId,
                        note: 'Invoice closed by subscription activation (FIFO)',
                    },
                });
                coveredMinor += invMinor;
            }
            const residualMinor = debtPaidMinor - coveredMinor;
            if (residualMinor > 0n) {
                await tx.debtLedgerEntry.create({
                    data: {
                        customerId: params.customerId,
                        orderId: null,
                        source: client_1.DebtSource.PAYMENT,
                        category,
                        amount: this.decimalFromMinor(residualMinor),
                        branchId: subsidyBranchId,
                        actorUserId: params.performedByUserId,
                        note: 'Residual debt cleared by subscription activation',
                    },
                });
            }
        }
        const prepaidReconciled = await this.autoReconcileUnpaidInvoicesFromPrepaidBalanceTx(tx, params.customerId, params.performedByUserId);
        const walletFinal = await tx.customerWallet.findUniqueOrThrow({
            where: { customerId: params.customerId },
            select: { balance: true, debt: true },
        });
        return {
            totalCollected: totalCollectedStr,
            debtSettled: debtSettledStr,
            creditedToBalance: creditedStr,
            previousBalance: wallet.balance.toString(),
            previousDebt: wallet.debt.toString(),
            newBalance: walletFinal.balance.toString(),
            newDebt: walletFinal.debt.toString(),
            subscriptionId: newSubscription.id,
            rolledOverFromSubscriptionId: previousSubscription?.id ?? null,
            carriedBalanceKd: carriedBalanceStr,
            closedInvoiceIds,
            prepaidAutoReconciledOrderIds: prepaidReconciled.paidOrderIds,
        };
    }
    async recordDebtInvoiceCollectedAtCallCenter(tx, params) {
        const { orderId, confirmedMethod, performedByUserId } = params;
        const order = await tx.order.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                status: true,
                customerId: true,
                totalPrice: true,
                posPaymentMethod: true,
                walletSettledAt: true,
            },
        });
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        if (order.status === client_1.OrderStatus.CANCELED) {
            throw new common_1.BadRequestException('Order is canceled — cannot record collection');
        }
        if (order.posPaymentMethod !== client_1.PosPaymentMethod.DEBT_ON_ACCOUNT) {
            throw new common_1.BadRequestException('This path only applies to invoices that were sold as debt-on-account');
        }
        if (!order.walletSettledAt) {
            throw new common_1.BadRequestException('Invoice has no ledger booking yet — use the standard manual mark flow');
        }
        const [shortAgg, payAgg] = await Promise.all([
            tx.debtLedgerEntry.aggregate({
                where: {
                    orderId,
                    source: client_1.DebtSource.INVOICE_SHORTFALL,
                },
                _sum: { amount: true },
            }),
            tx.debtLedgerEntry.aggregate({
                where: {
                    orderId,
                    source: client_1.DebtSource.PAYMENT,
                },
                _sum: { amount: true },
            }),
        ]);
        const shortfall = new client_1.Prisma.Decimal(shortAgg._sum.amount?.toString() ?? '0');
        const paidDirect = new client_1.Prisma.Decimal(payAgg._sum.amount?.toString() ?? '0');
        const remaining = shortfall.minus(paidDirect);
        if (remaining.lessThanOrEqualTo(new client_1.Prisma.Decimal(0))) {
            await tx.order.update({
                where: { id: orderId },
                data: {
                    posPaymentMethod: confirmedMethod,
                    cashStatus: (0, cash_status_for_method_1.cashStatusForPaymentMethod)(confirmedMethod),
                },
            });
            return { kind: 'already_cleared' };
        }
        const wallet = await this.getOrCreateWalletTx(tx, order.customerId);
        const debtMinor = (0, finance_money_1.toMinorFromFixed4)(wallet.debt);
        const remainingMinor = (0, finance_money_1.toMinorFromFixed4)(remaining);
        const paydownMinor = remainingMinor < debtMinor ? remainingMinor : debtMinor;
        if (paydownMinor <= 0n) {
            throw new common_1.BadRequestException('Aggregate wallet debt is zero while this invoice still carries an open balance — contact accounting');
        }
        const newDebtMinor = debtMinor - paydownMinor;
        const paydownKdStr = (0, finance_money_1.minorToAmountString)(paydownMinor);
        await tx.customerWallet.update({
            where: { id: wallet.id },
            data: { debt: this.decimalFromMinor(newDebtMinor) },
        });
        const actor = await tx.user.findUnique({
            where: { id: performedByUserId },
            select: { id: true, safariRole: true, branchId: true },
        });
        if (!actor) {
            throw new common_1.NotFoundException('Performing user not found');
        }
        const cust = await tx.customer.findUnique({
            where: { id: order.customerId },
            select: { originBranchId: true },
        });
        const branchId = cust?.originBranchId ?? actor.branchId ?? null;
        const category = this.resolveDebtCategory(actor.safariRole);
        await tx.transactionHistory.create({
            data: {
                type: client_1.LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
                customerId: order.customerId,
                orderId,
                subscriptionId: null,
                amount: this.decimalFromMinor(paydownMinor),
                balanceBefore: wallet.balance,
                balanceAfter: wallet.balance,
                debtBefore: wallet.debt,
                debtAfter: this.decimalFromMinor(newDebtMinor),
                performedById: performedByUserId,
                metadata: {
                    debtSettled: paydownKdStr,
                    debtSettlementViaCallCenter: true,
                    confirmedPaymentMethod: confirmedMethod,
                    originalPaymentMethod: client_1.PosPaymentMethod.DEBT_ON_ACCOUNT,
                    reportingCategory: 'DEBT_INVOICE_PHYSICAL_COLLECTION',
                },
            },
        });
        await tx.debtLedgerEntry.create({
            data: {
                customerId: order.customerId,
                orderId,
                source: client_1.DebtSource.PAYMENT,
                category,
                amount: this.decimalFromMinor(paydownMinor),
                branchId,
                actorUserId: performedByUserId,
                note: 'Debt-on-account invoice collected at Call Center',
            },
        });
        await this.generalLedger.append(tx, {
            entryType: client_1.GeneralLedgerEntryType.DEBT_ADJUSTMENT,
            amount: `-${paydownKdStr}`,
            memo: 'Debt-on-account invoice collected via Call Center',
            customerId: order.customerId,
            orderId,
            actorUserId: performedByUserId,
            metadata: {
                event: 'DEBT_COLLECTED',
                source: 'CC_DEBT_INVOICE_PHYSICAL',
                posPaymentMethod: confirmedMethod,
                category,
                branchId,
            },
        });
        await tx.order.update({
            where: { id: orderId },
            data: {
                posPaymentMethod: confirmedMethod,
                cashStatus: (0, cash_status_for_method_1.cashStatusForPaymentMethod)(confirmedMethod),
            },
        });
        return { kind: 'applied' };
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
            const thDebtRow = await tx.transactionHistory.create({
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
                await tx.debtLedgerEntry.create({
                    data: {
                        customerId: params.customerId,
                        orderId: null,
                        source: client_1.DebtSource.PAYMENT,
                        category,
                        amount: this.decimalFromMinor(amountMinor),
                        branchId,
                        actorUserId: params.performedByUserId,
                        note: params.note ?? 'Partial debt payment collected via Call Center',
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
                transactionHistoryId: thDebtRow.id,
            };
        }, { maxWait: 10_000, timeout: 15_000 });
    }
};
exports.CustomerLedgerService = CustomerLedgerService;
exports.CustomerLedgerService = CustomerLedgerService = CustomerLedgerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        general_ledger_service_1.GeneralLedgerService,
        inventory_service_1.InventoryService])
], CustomerLedgerService);
//# sourceMappingURL=customer-ledger.service.js.map