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
const jwt_1 = require("@nestjs/jwt");
const prisma_service_1 = require("../prisma/prisma.service");
const customer_ledger_service_1 = require("../customer-ledger/customer-ledger.service");
const payments_service_1 = require("../common/services/payments.service");
const customer_notifications_service_1 = require("../customer-notifications/customer-notifications.service");
const debt_service_1 = require("../finance/services/debt.service");
const orders_service_1 = require("../orders/orders.service");
const kuwait_customer_phone_1 = require("../common/validation/kuwait-customer-phone");
const collections_whatsapp_text_1 = require("./collections-whatsapp-text");
function assertCallCenterMaySendCollectionPaymentWa(ccCollectionPaymentWaLocked, actor) {
    if (!ccCollectionPaymentWaLocked ||
        (actor.role !== client_1.SafariRole.CALL_CENTER &&
            actor.role !== client_1.SafariRole.CALL_CENTER_SUPERVISOR)) {
        return;
    }
    throw new common_1.ForbiddenException('تم إرسال رابط الدفع للعميل من الميدان (سائق/مدير فرع). لا يمكن لمركز الاتصال إرسال تذكير واتساب إضافي لتفادي إزعاج العميل.');
}
const ORDER_REMINDER_COOLDOWN_MS = 2.5 * 60 * 60 * 1000;
const SUBSCRIBER_REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
function buildReminderResult(args) {
    const { sent, reminderCount, lastReminderAt, now, cooldownMs } = args;
    const nextAllowedAt = !sent && lastReminderAt
        ? new Date(lastReminderAt.getTime() + cooldownMs)
        : null;
    const remainingMs = nextAllowedAt
        ? Math.max(0, nextAllowedAt.getTime() - now.getTime())
        : null;
    const minutesUntilNext = remainingMs !== null ? Math.ceil(remainingMs / (60 * 1000)) : null;
    const hoursUntilNext = remainingMs !== null ? Math.ceil(remainingMs / (60 * 60 * 1000)) : null;
    return {
        sent,
        reminderCount,
        lastReminderAtIso: lastReminderAt?.toISOString() ?? null,
        nextAllowedAtIso: nextAllowedAt?.toISOString() ?? null,
        hoursUntilNext,
        minutesUntilNext,
    };
}
const FOUR_DP = (d) => d.toFixed(4);
const KWD_DP = (d) => d.toFixed(3);
function parseDayUtc(iso) {
    const d = new Date(`${iso}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) {
        throw new common_1.BadRequestException(`Invalid date: ${iso}`);
    }
    return d;
}
const KUWAIT_OFFSET_MS = 3 * 60 * 60 * 1000;
function kuwaitDayBounds(now) {
    const shifted = new Date(now.getTime() + KUWAIT_OFFSET_MS);
    const y = shifted.getUTCFullYear();
    const m = shifted.getUTCMonth();
    const d = shifted.getUTCDate();
    const dayStart = new Date(Date.UTC(y, m, d) - KUWAIT_OFFSET_MS);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const dayIsoLocal = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return { dayStart, dayEnd, dayIsoLocal };
}
function toKuwaitIsoDay(d) {
    const shifted = new Date(d.getTime() + KUWAIT_OFFSET_MS);
    const y = shifted.getUTCFullYear();
    const mo = shifted.getUTCMonth() + 1;
    const day = shifted.getUTCDate();
    return `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function parseKuwaitCalendarDateStart(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
    if (!m) {
        throw new common_1.BadRequestException(`Invalid date: ${iso}`);
    }
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    return new Date(Date.UTC(y, mo - 1, d) - KUWAIT_OFFSET_MS);
}
function addKuwaitCalendarDays(isoYmd, deltaDays) {
    const start = parseKuwaitCalendarDateStart(isoYmd);
    return toKuwaitIsoDay(new Date(start.getTime() + deltaDays * 86400000));
}
function orderBranchWhere(branchId) {
    if (!branchId)
        return undefined;
    return {
        OR: [
            { driver: { is: { branchId } } },
            {
                driverId: null,
                customer: { is: { originBranchId: branchId } },
            },
        ],
    };
}
function ledgerBranchWhere(branchId) {
    if (!branchId)
        return undefined;
    return {
        OR: [
            { performedBy: { is: { branchId } } },
            { order: { is: { driver: { is: { branchId } } } } },
            { order: { is: { customer: { is: { originBranchId: branchId } } } } },
            { customer: { is: { originBranchId: branchId } } },
        ],
    };
}
function extractDebtSettled(meta) {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
        return new client_1.Prisma.Decimal(0);
    }
    const v = meta.debtSettled;
    if (typeof v === 'string' && v.trim()) {
        try {
            return new client_1.Prisma.Decimal(v);
        }
        catch {
            return new client_1.Prisma.Decimal(0);
        }
    }
    if (typeof v === 'number' && Number.isFinite(v)) {
        try {
            return new client_1.Prisma.Decimal(v);
        }
        catch {
            return new client_1.Prisma.Decimal(0);
        }
    }
    return new client_1.Prisma.Decimal(0);
}
function isDebtViaLinkRow(meta) {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta))
        return false;
    return meta.debtSettlementViaLink === true;
}
function isManualCallCenterCollectionRow(meta) {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta))
        return false;
    const m = meta;
    return (m.debtSettlementViaCallCenter === true || m.debtPaymentOnly === true);
}
function isPartialDebtPaymentRow(meta) {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta))
        return false;
    return meta.debtPaymentOnly === true;
}
function extractDebtDiscount(meta) {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
        return new client_1.Prisma.Decimal(0);
    }
    const v = meta.debtDiscount;
    if (typeof v !== 'string')
        return new client_1.Prisma.Decimal(0);
    try {
        return new client_1.Prisma.Decimal(v);
    }
    catch {
        return new client_1.Prisma.Decimal(0);
    }
}
function readMetaString(meta, key) {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta))
        return null;
    const v = meta[key];
    return typeof v === 'string' && v.length > 0 ? v : null;
}
function readMetaStringArray(meta, key) {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta))
        return [];
    const v = meta[key];
    if (!Array.isArray(v))
        return [];
    return v.filter((x) => typeof x === 'string' && x.length > 0);
}
function parseMetaAppliedFromWallet(meta) {
    const s = readMetaString(meta, 'appliedFromWallet');
    if (!s)
        return new client_1.Prisma.Decimal(0);
    try {
        const d = new client_1.Prisma.Decimal(s);
        return d.lt(0) ? new client_1.Prisma.Decimal(0) : d;
    }
    catch {
        return new client_1.Prisma.Decimal(0);
    }
}
function classifyOrderWalletLedgerKind(meta, paymentMethod) {
    const applied = parseMetaAppliedFromWallet(meta);
    const externalMethods = new Set([
        client_1.PosPaymentMethod.CASH,
        client_1.PosPaymentMethod.KNET,
        client_1.PosPaymentMethod.ONLINE,
        client_1.PosPaymentMethod.PAYMENT_LINK,
    ]);
    if (paymentMethod === client_1.PosPaymentMethod.SUBSCRIPTION_WALLET) {
        return 'ORDER_SETTLEMENT_SUBSCRIPTION';
    }
    if (paymentMethod === client_1.PosPaymentMethod.DEBT_ON_ACCOUNT) {
        return 'ORDER_INVOICE_ON_ACCOUNT';
    }
    if (paymentMethod && externalMethods.has(paymentMethod)) {
        return applied.gt(0)
            ? 'ORDER_INVOICE_PARTIAL_PAYMENT'
            : 'ORDER_PAID_IN_FULL';
    }
    if (applied.gt(0)) {
        return 'ORDER_SETTLEMENT_SUBSCRIPTION';
    }
    return 'ORDER_PAID_IN_FULL';
}
function kuwaitDayFromIso(iso) {
    const base = parseDayUtc(iso);
    const dayStart = new Date(base.getTime() - KUWAIT_OFFSET_MS);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    return { dayStart, dayEnd };
}
let CallCenterService = class CallCenterService {
    prisma;
    customerLedger;
    payments;
    jwt;
    orders;
    customerNotifications;
    debt;
    constructor(prisma, customerLedger, payments, jwt, orders, customerNotifications, debt) {
        this.prisma = prisma;
        this.customerLedger = customerLedger;
        this.payments = payments;
        this.jwt = jwt;
        this.orders = orders;
        this.customerNotifications = customerNotifications;
        this.debt = debt;
    }
    async assertOrderInCollectionScope(orderId, actor) {
        if (actor.role !== client_1.SafariRole.MANAGER && actor.role !== client_1.SafariRole.DRIVER) {
            return;
        }
        const o = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                driverId: true,
                driver: { select: { branchId: true } },
                customer: { select: { originBranchId: true } },
            },
        });
        if (!o) {
            throw new common_1.NotFoundException('Order not found');
        }
        if (actor.role === client_1.SafariRole.DRIVER) {
            if (o.driverId !== actor.userId) {
                throw new common_1.ForbiddenException('This invoice is not assigned to you for follow-up');
            }
            return;
        }
        const b = actor.branchId;
        if (!b) {
            return;
        }
        const inBranch = (o.driverId && o.driver?.branchId === b) ||
            (!o.driverId && o.customer?.originBranchId === b);
        if (!inBranch) {
            throw new common_1.ForbiddenException('This invoice is outside your branch scope');
        }
    }
    async createStatementShareToken(customerId, params) {
        const customer = await this.prisma.customer.findUnique({
            where: { id: customerId },
            select: { id: true },
        });
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        const payload = {
            purpose: 'STATEMENT_SHARE',
            customerId,
            from: params.from || undefined,
            to: params.to || undefined,
        };
        const token = await this.jwt.signAsync(payload, { expiresIn: '7d' });
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const base = params.publicBaseUrl.replace(/\/$/, '');
        const shareUrl = `${base}/public/statement/${token}`;
        return {
            token,
            shareUrl,
            expiresAtIso: expiresAt.toISOString(),
        };
    }
    async getPublicStatement(token) {
        let payload;
        try {
            payload = await this.jwt.verifyAsync(token);
        }
        catch {
            throw new common_1.NotFoundException('رابط الكشف غير صالح أو منتهي الصلاحية');
        }
        if (payload.purpose !== 'STATEMENT_SHARE' || !payload.customerId) {
            throw new common_1.NotFoundException('رابط الكشف غير صالح');
        }
        return this.getCustomerLedger(payload.customerId, {
            from: payload.from,
            to: payload.to,
            limit: 500,
        });
    }
    async ensureOrderPaymentLink(orderId, actor) {
        await this.assertOrderInCollectionScope(orderId, actor);
        const link = await this.payments.ensurePaymentLinkForUnpaidOrder(orderId);
        return { url: link.url };
    }
    async sendPaymentLinkToCustomerWhatsapp(orderId, actor) {
        await this.assertOrderInCollectionScope(orderId, actor);
        const lockRow = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: { ccCollectionPaymentWaLocked: true },
        });
        assertCallCenterMaySendCollectionPaymentWa(lockRow?.ccCollectionPaymentWaLocked ?? false, actor);
        const link = await this.payments.ensurePaymentLinkForUnpaidOrder(orderId);
        const reminder = await this.sendOrderReminder(orderId, actor);
        if (!reminder.sent) {
            return { reminder, serverPush: false, paymentUrl: link.url };
        }
        const snap = await this.orders.getUnpaidCollectionOrderRowForWhatsappText(orderId);
        if (!snap) {
            throw new common_1.BadRequestException('Order is not open for collection messaging (settled, canceled, or not found).');
        }
        const to = (0, kuwait_customer_phone_1.resolveCustomerPhoneForNotify)(snap.customerPhone, snap.customerPhone2);
        if (!to.trim()) {
            throw new common_1.BadRequestException('No customer phone on file for this order');
        }
        const message = (0, collections_whatsapp_text_1.buildCollectionsPaymentLinkTextAr)(snap, link.url);
        const serverPush = await this.customerNotifications.deliverCollectionsPaymentLinkNow({
            customerPhone: to,
            orderId: snap.orderId,
            message,
        });
        return { reminder, serverPush, paymentUrl: link.url };
    }
    async markCollectionOrderPaid(orderId, method, performedByUserId, actor) {
        await this.assertOrderInCollectionScope(orderId, actor);
        return this.payments.manuallyMarkOrderPaidByMethod({
            orderId,
            method,
            performedByUserId,
        });
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
                autoCloseInvoices: dto.autoCloseInvoices === true,
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
                    price: plan.salePrice.toString(),
                    creditAmount: plan.actualBalance.toString(),
                },
                wallet: {
                    balance: wallet.balance.toString(),
                    debt: wallet.debt.toString(),
                },
                settlement,
            };
        }, { maxWait: 10_000, timeout: 15_000 });
    }
    async extendSubscription(userId, dto) {
        return this.prisma.$transaction(async (tx) => {
            const wallet = await tx.customerWallet.findUnique({
                where: { customerId: dto.customerId },
                select: {
                    id: true,
                    balance: true,
                    debt: true,
                    subscriptionPlanId: true,
                    subscriptionPlanName: true,
                    subscriptionActivatedAt: true,
                    subscriptionExpiresAt: true,
                },
            });
            if (!wallet) {
                throw new common_1.NotFoundException('Customer has no wallet — activate a subscription before extending.');
            }
            if (!wallet.subscriptionPlanId || !wallet.subscriptionExpiresAt) {
                throw new common_1.BadRequestException('No active subscription found — use Upgrade to start a new plan.');
            }
            const now = new Date();
            const anchor = wallet.subscriptionExpiresAt.getTime() > now.getTime()
                ? wallet.subscriptionExpiresAt
                : now;
            const newExpiry = new Date(anchor.getTime());
            newExpiry.setUTCDate(newExpiry.getUTCDate() + dto.extensionDays);
            await tx.customerWallet.update({
                where: { id: wallet.id },
                data: { subscriptionExpiresAt: newExpiry },
            });
            await tx.transactionHistory.create({
                data: {
                    type: client_1.LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
                    customerId: dto.customerId,
                    amount: new client_1.Prisma.Decimal(0),
                    balanceBefore: wallet.balance,
                    balanceAfter: wallet.balance,
                    debtBefore: wallet.debt,
                    debtAfter: wallet.debt,
                    performedById: userId,
                    metadata: {
                        extensionOnly: true,
                        extensionDays: dto.extensionDays,
                        planId: wallet.subscriptionPlanId,
                        planName: wallet.subscriptionPlanName ?? null,
                        previousExpiresAt: wallet.subscriptionExpiresAt.toISOString(),
                        newExpiresAt: newExpiry.toISOString(),
                    },
                },
            });
            return {
                customerId: dto.customerId,
                extensionDays: dto.extensionDays,
                previousExpiresAt: wallet.subscriptionExpiresAt.toISOString(),
                newExpiresAt: newExpiry.toISOString(),
                planId: wallet.subscriptionPlanId,
                planName: wallet.subscriptionPlanName ?? null,
            };
        }, { maxWait: 10_000, timeout: 15_000 });
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
    async sendOrderReminder(orderId, actor) {
        await this.assertOrderInCollectionScope(orderId, actor);
        const lockRow = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: { ccCollectionPaymentWaLocked: true },
        });
        assertCallCenterMaySendCollectionPaymentWa(lockRow?.ccCollectionPaymentWaLocked ?? false, actor);
        const now = new Date();
        const cutoff = new Date(now.getTime() - ORDER_REMINDER_COOLDOWN_MS);
        const update = await this.prisma.order.updateMany({
            where: {
                id: orderId,
                OR: [
                    { lastReminderAt: null },
                    { lastReminderAt: { lt: cutoff } },
                ],
            },
            data: {
                reminderCount: { increment: 1 },
                lastReminderAt: now,
            },
        });
        const fresh = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: { reminderCount: true, lastReminderAt: true },
        });
        if (!fresh)
            throw new common_1.NotFoundException('Order not found');
        return buildReminderResult({
            sent: update.count > 0,
            reminderCount: fresh.reminderCount,
            lastReminderAt: fresh.lastReminderAt,
            now,
            cooldownMs: ORDER_REMINDER_COOLDOWN_MS,
        });
    }
    async sendSubscriberReminder(customerId) {
        const now = new Date();
        const cutoff = new Date(now.getTime() - SUBSCRIBER_REMINDER_COOLDOWN_MS);
        const update = await this.prisma.customerWallet.updateMany({
            where: {
                customerId,
                OR: [
                    { subscriptionLastReminderAt: null },
                    { subscriptionLastReminderAt: { lt: cutoff } },
                ],
            },
            data: {
                subscriptionReminderCount: { increment: 1 },
                subscriptionLastReminderAt: now,
            },
        });
        const fresh = await this.prisma.customerWallet.findUnique({
            where: { customerId },
            select: {
                subscriptionReminderCount: true,
                subscriptionLastReminderAt: true,
            },
        });
        if (!fresh) {
            const customer = await this.prisma.customer.findUnique({
                where: { id: customerId },
                select: { id: true },
            });
            if (!customer)
                throw new common_1.NotFoundException('Customer not found');
            const createdWallet = await this.prisma.customerWallet.create({
                data: {
                    customerId,
                    subscriptionReminderCount: 1,
                    subscriptionLastReminderAt: now,
                },
                select: {
                    subscriptionReminderCount: true,
                    subscriptionLastReminderAt: true,
                },
            });
            return buildReminderResult({
                sent: true,
                reminderCount: createdWallet.subscriptionReminderCount,
                lastReminderAt: createdWallet.subscriptionLastReminderAt,
                now,
                cooldownMs: SUBSCRIBER_REMINDER_COOLDOWN_MS,
            });
        }
        return buildReminderResult({
            sent: update.count > 0,
            reminderCount: fresh.subscriptionReminderCount,
            lastReminderAt: fresh.subscriptionLastReminderAt,
            now,
            cooldownMs: SUBSCRIBER_REMINDER_COOLDOWN_MS,
        });
    }
    async getOperationsSummary(branchId = null, actor) {
        const now = new Date();
        const { dayStart, dayEnd, dayIsoLocal } = kuwaitDayBounds(now);
        const isDriver = actor?.role === client_1.SafariRole.DRIVER;
        const effectiveBranchId = isDriver ? null
            : branchId ??
                (actor?.role === client_1.SafariRole.MANAGER && actor.branchId ?
                    actor.branchId
                    : null);
        const orderBranch = isDriver && actor
            ? { driverId: actor.userId }
            : (orderBranchWhere(effectiveBranchId) ?? {});
        const ledgerBranchFilter = isDriver && actor
            ? { order: { driverId: actor.userId } }
            : effectiveBranchId
                ? { branchId: effectiveBranchId }
                : {};
        const orderBranchScope = orderBranchWhere(effectiveBranchId);
        const transactionOrderScope = isDriver && actor
            ? { order: { is: { driverId: actor.userId } } }
            : orderBranchScope
                ? { order: { is: orderBranchScope } }
                : {};
        const [redCardTotal, todaysSettlementRows, todaysSubscriptionActivationRows, pendingLinksCount, ledgerDebtSplit,] = await Promise.all([
            this.orders.sumCollectionsDebtTotalKd(effectiveBranchId, actor ?? undefined),
            this.prisma.transactionHistory.findMany({
                where: {
                    type: client_1.LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
                    createdAt: { gte: dayStart, lt: dayEnd },
                    ...transactionOrderScope,
                },
                select: { metadata: true },
            }),
            this.prisma.transactionHistory.findMany({
                where: {
                    type: client_1.LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
                    createdAt: { gte: dayStart, lt: dayEnd },
                    ...transactionOrderScope,
                },
                select: { metadata: true },
            }),
            this.prisma.order.count({
                where: {
                    cashStatus: client_1.CashStatus.UNPAID,
                    status: { not: client_1.OrderStatus.CANCELED },
                    posHostedPaymentUrl: { not: null },
                    ...orderBranch,
                },
            }),
            this.debt.getLedgerOpenDebtByCategory(ledgerBranchFilter),
        ]);
        let collectedTodayFromOrders = new client_1.Prisma.Decimal(0);
        for (const r of todaysSettlementRows) {
            const debtSettled = extractDebtSettled(r.metadata);
            if (debtSettled.gt(0)) {
                collectedTodayFromOrders = collectedTodayFromOrders.plus(debtSettled);
            }
        }
        let subscriptionActivationDebtToday = new client_1.Prisma.Decimal(0);
        for (const r of todaysSubscriptionActivationRows) {
            const debtSettled = extractDebtSettled(r.metadata);
            if (debtSettled.gt(0)) {
                subscriptionActivationDebtToday =
                    subscriptionActivationDebtToday.plus(debtSettled);
            }
        }
        const recoveredToday = collectedTodayFromOrders.plus(subscriptionActivationDebtToday);
        return {
            totalMarketDebtKd: KWD_DP(redCardTotal),
            outstandingInvoiceDebtKd: KWD_DP(new client_1.Prisma.Decimal(ledgerDebtSplit.outstandingInvoiceDebtKd)),
            outstandingSubscriptionDebtKd: KWD_DP(new client_1.Prisma.Decimal(ledgerDebtSplit.outstandingSubscriptionDebtKd)),
            debtCollectedTodayKd: KWD_DP(collectedTodayFromOrders),
            debtRecoveredTodayKd: KWD_DP(recoveredToday),
            pendingLinksCount,
            dayIso: dayIsoLocal,
            branchId: effectiveBranchId ?? null,
        };
    }
    async getDebtRecoveryReport(fromIso, toIso) {
        const todayKuwait = toKuwaitIsoDay(new Date());
        const toDayStr = toIso?.trim() || todayKuwait;
        const fromDayStr = fromIso?.trim() || addKuwaitCalendarDays(todayKuwait, -29);
        if (fromDayStr > toDayStr) {
            throw new common_1.BadRequestException('`from` must be on or before `to`');
        }
        const fromBound = parseKuwaitCalendarDateStart(fromDayStr);
        const windowEnd = new Date(parseKuwaitCalendarDateStart(toDayStr).getTime() + 86400000);
        const rows = await this.prisma.transactionHistory.findMany({
            where: {
                createdAt: { gte: fromBound, lt: windowEnd },
                type: {
                    in: [
                        client_1.LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
                        client_1.LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
                    ],
                },
            },
            select: {
                createdAt: true,
                type: true,
                metadata: true,
            },
            orderBy: { createdAt: 'asc' },
        });
        const buckets = new Map();
        for (let d = fromDayStr; d <= toDayStr; d = addKuwaitCalendarDays(d, 1)) {
            const key = d;
            buckets.set(key, {
                dayIso: key,
                recoveredKd: '0.0000',
                recoveredCashKd: '0.0000',
                recoveredElectronicKd: '0.0000',
                recoveredWalletKd: '0.0000',
                settlementCount: 0,
                subscriptionCount: 0,
            });
        }
        let total = new client_1.Prisma.Decimal(0);
        let totalCash = new client_1.Prisma.Decimal(0);
        let totalElectronic = new client_1.Prisma.Decimal(0);
        let totalWallet = new client_1.Prisma.Decimal(0);
        for (const r of rows) {
            const key = toKuwaitIsoDay(r.createdAt);
            const bucket = buckets.get(key);
            if (!bucket)
                continue;
            const debtSettled = extractDebtSettled(r.metadata);
            if (debtSettled.lte(0)) {
                if (r.type === client_1.LedgerTransactionType.ORDER_WALLET_SETTLEMENT) {
                    bucket.settlementCount += 1;
                }
                else {
                    bucket.subscriptionCount += 1;
                }
                continue;
            }
            total = total.plus(debtSettled);
            bucket.recoveredKd = FOUR_DP(new client_1.Prisma.Decimal(bucket.recoveredKd).plus(debtSettled));
            let channel;
            if (r.type === client_1.LedgerTransactionType.SUBSCRIPTION_ACTIVATION) {
                channel = 'wallet';
            }
            else {
                const rawMethod = readMetaString(r.metadata, 'confirmedPaymentMethod') ??
                    readMetaString(r.metadata, 'posPaymentMethod') ??
                    readMetaString(r.metadata, 'paymentMethod');
                if (rawMethod === client_1.PosPaymentMethod.KNET ||
                    rawMethod === client_1.PosPaymentMethod.PAYMENT_LINK ||
                    rawMethod === client_1.PosPaymentMethod.ONLINE) {
                    channel = 'electronic';
                }
                else {
                    channel = 'cash';
                }
            }
            if (channel === 'cash') {
                totalCash = totalCash.plus(debtSettled);
                bucket.recoveredCashKd = FOUR_DP(new client_1.Prisma.Decimal(bucket.recoveredCashKd).plus(debtSettled));
            }
            else if (channel === 'electronic') {
                totalElectronic = totalElectronic.plus(debtSettled);
                bucket.recoveredElectronicKd = FOUR_DP(new client_1.Prisma.Decimal(bucket.recoveredElectronicKd).plus(debtSettled));
            }
            else {
                totalWallet = totalWallet.plus(debtSettled);
                bucket.recoveredWalletKd = FOUR_DP(new client_1.Prisma.Decimal(bucket.recoveredWalletKd).plus(debtSettled));
            }
            if (r.type === client_1.LedgerTransactionType.ORDER_WALLET_SETTLEMENT) {
                bucket.settlementCount += 1;
            }
            else {
                bucket.subscriptionCount += 1;
            }
        }
        return {
            from: fromDayStr,
            to: toDayStr,
            totalRecoveredKd: FOUR_DP(total),
            totalRecoveredCashKd: FOUR_DP(totalCash),
            totalRecoveredElectronicKd: FOUR_DP(totalElectronic),
            totalRecoveredWalletKd: FOUR_DP(totalWallet),
            days: Array.from(buckets.values()),
        };
    }
    async previewSubscriptionRollover(customerId) {
        const customer = await this.prisma.customer.findUnique({
            where: { id: customerId },
            select: { id: true },
        });
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        const [wallet, previous] = await Promise.all([
            this.prisma.customerWallet.findUnique({
                where: { customerId },
                select: { balance: true, debt: true },
            }),
            this.prisma.customerSubscription.findFirst({
                where: {
                    customerId,
                    status: {
                        in: [
                            client_1.CustomerSubscriptionStatus.ACTIVE,
                            client_1.CustomerSubscriptionStatus.EXPIRED,
                        ],
                    },
                },
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    planNameSnapshot: true,
                    activatedAt: true,
                    expiresAt: true,
                },
            }),
        ]);
        const balance = wallet?.balance ?? new client_1.Prisma.Decimal(0);
        const debt = wallet?.debt ?? new client_1.Prisma.Decimal(0);
        const carried = balance.minus(debt);
        if (!previous) {
            return {
                hasPrevious: false,
                currentWalletBalanceKd: balance.toFixed(4),
                currentWalletDebtKd: debt.toFixed(4),
            };
        }
        return {
            hasPrevious: true,
            carriedBalanceKd: carried.toFixed(4),
            previousPlanName: previous.planNameSnapshot,
            previousActivatedAtIso: previous.activatedAt.toISOString(),
            previousExpiresAtIso: previous.expiresAt.toISOString(),
            currentWalletBalanceKd: balance.toFixed(4),
            currentWalletDebtKd: debt.toFixed(4),
        };
    }
    async listCustomerSubscriptionChain(customerId) {
        const customer = await this.prisma.customer.findUnique({
            where: { id: customerId },
            select: { id: true },
        });
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        const subs = await this.prisma.customerSubscription.findMany({
            where: { customerId },
            orderBy: { activatedAt: 'desc' },
        });
        if (subs.length === 0)
            return [];
        const ids = subs.map((s) => s.id);
        const orders = await this.prisma.order.findMany({
            where: { subscriptionId: { in: ids } },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                subscriptionId: true,
                invoiceNumber: true,
                totalPrice: true,
                status: true,
                cashStatus: true,
                createdAt: true,
                completedAt: true,
            },
        });
        const ordersBySub = new Map();
        for (const o of orders) {
            if (!o.subscriptionId)
                continue;
            const list = ordersBySub.get(o.subscriptionId) ?? [];
            list.push({
                orderId: o.id,
                invoiceNumber: o.invoiceNumber ?? undefined,
                totalPriceKd: o.totalPrice.toFixed(4),
                status: o.status,
                cashStatus: o.cashStatus,
                createdAtIso: o.createdAt.toISOString(),
                completedAtIso: o.completedAt?.toISOString(),
            });
            ordersBySub.set(o.subscriptionId, list);
        }
        return this.mapSubscriptionChainRows(subs, ordersBySub);
    }
    async recordPartialDebtPayment(customerId, dto, performedByUserId) {
        const method = dto.paymentMethod;
        const result = await this.customerLedger.recordPartialDebtPayment({
            customerId,
            amountKd: dto.amountKd,
            discountKd: dto.discountKd,
            paymentMethod: method,
            performedByUserId,
            note: dto.note,
        });
        try {
            const cust = await this.prisma.customer.findUnique({
                where: { id: customerId },
                select: { phone: true, phone2: true },
            });
            const phone = cust
                ? (0, kuwait_customer_phone_1.resolveCustomerPhoneForNotify)(cust.phone, cust.phone2)
                : '';
            if (!phone.trim()) {
                return result;
            }
            this.customerNotifications.notifyStandaloneDebtReceipt({
                customerPhone: phone,
                transactionHistoryId: result.transactionHistoryId,
                amountCollectedKd: result.amountCollectedKd,
                remainingDebtKd: result.newDebtKd,
            });
        }
        catch {
        }
        return result;
    }
    async getCustomerLedger(customerId, filters) {
        const customer = await this.prisma.customer.findUnique({
            where: { id: customerId },
            select: {
                id: true,
                displayName: true,
                phone: true,
                phone2: true,
                originBranchId: true,
                originBranch: { select: { id: true, name: true } },
                wallet: {
                    select: { balance: true, debt: true },
                },
            },
        });
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        const latestSub = await this.prisma.customerSubscription.findFirst({
            where: { customerId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                status: true,
                planNameSnapshot: true,
                planSalePriceSnapshot: true,
                planActualBalanceSnapshot: true,
                planValidityDaysSnapshot: true,
                carriedBalanceKd: true,
                parentSubscriptionId: true,
                activatedAt: true,
                expiresAt: true,
                closedAt: true,
                closedReason: true,
            },
        });
        const fromIso = filters.from ?? null;
        const toIso = filters.to ?? null;
        const dateRange = {};
        if (fromIso)
            dateRange.gte = kuwaitDayFromIso(fromIso).dayStart;
        if (toIso)
            dateRange.lt = kuwaitDayFromIso(toIso).dayEnd;
        const take = Math.min(Math.max(filters.limit ?? 200, 1), 500);
        const skip = Math.max(filters.offset ?? 0, 0);
        const [events, invoices] = await Promise.all([
            this.prisma.transactionHistory.findMany({
                where: {
                    customerId,
                    ...(dateRange.gte || dateRange.lt
                        ? { createdAt: dateRange }
                        : {}),
                },
                orderBy: { createdAt: 'desc' },
                take,
                skip,
                select: {
                    id: true,
                    type: true,
                    amount: true,
                    balanceBefore: true,
                    balanceAfter: true,
                    debtBefore: true,
                    debtAfter: true,
                    createdAt: true,
                    metadata: true,
                    orderId: true,
                    subscriptionId: true,
                    order: {
                        select: {
                            id: true,
                            serialNumber: true,
                            invoiceNumber: true,
                            posPaymentMethod: true,
                        },
                    },
                    subscription: {
                        select: {
                            id: true,
                            planNameSnapshot: true,
                            status: true,
                        },
                    },
                    performedBy: {
                        select: { id: true, fullName: true, safariRole: true },
                    },
                },
            }),
            this.prisma.order.findMany({
                where: {
                    customerId,
                    ...(dateRange.gte || dateRange.lt
                        ? { createdAt: dateRange }
                        : {}),
                },
                orderBy: { createdAt: 'desc' },
                take,
                skip,
                select: {
                    id: true,
                    serialNumber: true,
                    invoiceNumber: true,
                    totalPrice: true,
                    status: true,
                    cashStatus: true,
                    posPaymentMethod: true,
                    createdAt: true,
                    completedAt: true,
                    subscriptionId: true,
                    subscription: {
                        select: {
                            id: true,
                            planNameSnapshot: true,
                            status: true,
                        },
                    },
                    driver: {
                        select: {
                            id: true,
                            fullName: true,
                            branch: { select: { id: true, name: true } },
                        },
                    },
                },
            }),
        ]);
        const orderIds = invoices.map((o) => o.id);
        const [fbAgg, fbLatest, fbRows] = await Promise.all([
            this.prisma.orderFeedback.aggregate({
                where: { order: { customerId } },
                _avg: { rating: true },
                _count: { _all: true },
            }),
            this.prisma.orderFeedback.findFirst({
                where: { order: { customerId } },
                orderBy: { submittedAt: 'desc' },
                select: {
                    rating: true,
                    note: true,
                    submittedAt: true,
                    orderId: true,
                    order: {
                        select: { serialNumber: true, invoiceNumber: true },
                    },
                },
            }),
            orderIds.length > 0
                ? this.prisma.orderFeedback.findMany({
                    where: { orderId: { in: orderIds } },
                    select: { orderId: true, rating: true, submittedAt: true },
                })
                : Promise.resolve([]),
        ]);
        const feedbackByOrderId = new Map(fbRows.map((r) => [r.orderId, r]));
        const ratingAvg = fbAgg._avg.rating;
        const feedbackSummary = {
            averageRating: ratingAvg != null ? Math.round(Number(ratingAvg) * 100) / 100 : null,
            ratedCount: fbAgg._count._all,
            lastFeedback: fbLatest ?
                {
                    rating: fbLatest.rating,
                    note: fbLatest.note,
                    submittedAtIso: fbLatest.submittedAt.toISOString(),
                    orderId: fbLatest.orderId,
                    orderSerial: fbLatest.order?.serialNumber?.trim() ||
                        fbLatest.order?.invoiceNumber?.trim() ||
                        null,
                }
                : null,
        };
        const allClosedIds = Array.from(new Set(events.flatMap((e) => e.type === client_1.LedgerTransactionType.SUBSCRIPTION_ACTIVATION
            ? readMetaStringArray(e.metadata, 'autoClosedInvoiceIds')
            : [])));
        const closedOrdersById = new Map();
        if (allClosedIds.length > 0) {
            const closedOrders = await this.prisma.order.findMany({
                where: { id: { in: allClosedIds } },
                select: {
                    id: true,
                    serialNumber: true,
                    invoiceNumber: true,
                    totalPrice: true,
                    createdAt: true,
                },
            });
            for (const o of closedOrders) {
                closedOrdersById.set(o.id, {
                    id: o.id,
                    serial: o.serialNumber ?? o.invoiceNumber ?? null,
                    totalKd: FOUR_DP(o.totalPrice),
                    createdAtIso: o.createdAt.toISOString(),
                });
            }
        }
        const mappedEvents = events.map((e) => {
            const rawMethod = readMetaString(e.metadata, 'posPaymentMethod') ??
                readMetaString(e.metadata, 'paymentMethod') ??
                e.order?.posPaymentMethod ??
                null;
            const paymentMethod = rawMethod && Object.values(client_1.PosPaymentMethod).includes(rawMethod)
                ? rawMethod
                : null;
            let kind;
            if (e.type === client_1.LedgerTransactionType.SUBSCRIPTION_ACTIVATION) {
                kind = 'SUBSCRIPTION_ACTIVATION';
            }
            else if (isPartialDebtPaymentRow(e.metadata)) {
                kind = 'PARTIAL_DEBT_PAYMENT';
            }
            else if (e.orderId) {
                kind = classifyOrderWalletLedgerKind(e.metadata, paymentMethod);
            }
            else {
                kind = 'SUBSCRIPTION_ROLLOVER_CARRY';
            }
            const debtSettled = extractDebtSettled(e.metadata);
            const debtDiscount = extractDebtDiscount(e.metadata);
            let activationBreakdown = null;
            let closedInvoicesForEvent = [];
            if (kind === 'SUBSCRIPTION_ACTIVATION') {
                activationBreakdown = {
                    totalCollectedKd: FOUR_DP(new client_1.Prisma.Decimal(readMetaString(e.metadata, 'totalCollected') ?? '0')),
                    actualBalanceKd: FOUR_DP(new client_1.Prisma.Decimal(readMetaString(e.metadata, 'actualBalance') ?? '0')),
                    subsidyKd: FOUR_DP(new client_1.Prisma.Decimal(readMetaString(e.metadata, 'subsidy') ?? '0')),
                    debtSettledKd: FOUR_DP(debtSettled),
                    creditedToBalanceKd: FOUR_DP(new client_1.Prisma.Decimal(readMetaString(e.metadata, 'creditedToBalance') ?? '0')),
                    carriedBalanceKd: FOUR_DP(new client_1.Prisma.Decimal(readMetaString(e.metadata, 'carriedBalanceKd') ?? '0')),
                };
                const ids = readMetaStringArray(e.metadata, 'autoClosedInvoiceIds');
                closedInvoicesForEvent = ids
                    .map((id) => closedOrdersById.get(id))
                    .filter((o) => !!o);
            }
            return {
                id: e.id,
                atIso: e.createdAt.toISOString(),
                rawType: e.type,
                kind,
                amountKd: FOUR_DP(e.amount),
                balanceBeforeKd: FOUR_DP(e.balanceBefore),
                balanceAfterKd: FOUR_DP(e.balanceAfter),
                debtBeforeKd: FOUR_DP(e.debtBefore),
                debtAfterKd: FOUR_DP(e.debtAfter),
                debtSettledKd: FOUR_DP(debtSettled),
                debtDiscountKd: FOUR_DP(debtDiscount),
                paymentMethod,
                orderId: e.orderId,
                orderSerial: e.order?.serialNumber ?? e.order?.invoiceNumber ?? null,
                subscriptionId: e.subscriptionId,
                subscriptionLabel: e.subscription?.planNameSnapshot ?? null,
                performedByUserId: e.performedBy?.id ?? null,
                performedByName: e.performedBy?.fullName ?? null,
                performedByRole: e.performedBy?.safariRole ?? null,
                note: readMetaString(e.metadata, 'note'),
                activationBreakdown,
                closedInvoices: closedInvoicesForEvent,
            };
        });
        const mappedInvoices = invoices.map((o) => {
            const openDebt = o.status !== client_1.OrderStatus.CANCELED &&
                o.cashStatus === client_1.CashStatus.UNPAID;
            const fr = feedbackByOrderId.get(o.id);
            return {
                id: o.id,
                serial: o.serialNumber ?? o.invoiceNumber ?? null,
                createdAtIso: o.createdAt.toISOString(),
                completedAtIso: o.completedAt?.toISOString() ?? null,
                totalKd: FOUR_DP(o.totalPrice),
                status: o.status,
                cashStatus: o.cashStatus,
                paymentMethod: o.posPaymentMethod ?? null,
                driverName: o.driver?.fullName ?? null,
                branchName: o.driver?.branch?.name ?? null,
                subscriptionId: o.subscriptionId,
                subscriptionStatus: o.subscription?.status ?? null,
                subscriptionLabel: o.subscription?.planNameSnapshot ?? null,
                issuedWhileCutOff: o.subscription?.status === client_1.CustomerSubscriptionStatus.CUT_OFF,
                openDebt,
                feedbackRating: fr?.rating ?? null,
                feedbackSubmittedAtIso: fr?.submittedAt.toISOString() ?? null,
            };
        });
        const totalCollected = mappedEvents.reduce((acc, e) => acc.plus(new client_1.Prisma.Decimal(e.debtSettledKd)), new client_1.Prisma.Decimal(0));
        const totalDiscounted = mappedEvents.reduce((acc, e) => acc.plus(new client_1.Prisma.Decimal(e.debtDiscountKd)), new client_1.Prisma.Decimal(0));
        const openInvoiceCount = mappedInvoices.filter((i) => i.openDebt).length;
        return {
            customer: {
                id: customer.id,
                displayName: customer.displayName ?? null,
                phone: customer.phone ?? null,
                phone2: customer.phone2 ?? null,
                originBranchId: customer.originBranchId ?? null,
                originBranchName: customer.originBranch?.name ?? null,
                walletBalanceKd: FOUR_DP(customer.wallet?.balance ?? new client_1.Prisma.Decimal(0)),
                walletDebtKd: FOUR_DP(customer.wallet?.debt ?? new client_1.Prisma.Decimal(0)),
            },
            activeSubscription: latestSub && latestSub.status === client_1.CustomerSubscriptionStatus.ACTIVE
                ? {
                    id: latestSub.id,
                    status: latestSub.status,
                    planNameSnapshot: latestSub.planNameSnapshot,
                    planSalePriceKd: FOUR_DP(latestSub.planSalePriceSnapshot),
                    planActualBalanceKd: FOUR_DP(latestSub.planActualBalanceSnapshot),
                    planValidityDays: latestSub.planValidityDaysSnapshot,
                    carriedBalanceKd: FOUR_DP(latestSub.carriedBalanceKd),
                    parentSubscriptionId: latestSub.parentSubscriptionId,
                    activatedAtIso: latestSub.activatedAt.toISOString(),
                    expiresAtIso: latestSub.expiresAt.toISOString(),
                    closedAtIso: latestSub.closedAt?.toISOString() ?? null,
                    closedReason: latestSub.closedReason ?? null,
                }
                : null,
            isCutOff: latestSub?.status === client_1.CustomerSubscriptionStatus.CUT_OFF,
            fromIso,
            toIso,
            events: mappedEvents,
            invoices: mappedInvoices,
            totals: {
                eventCount: mappedEvents.length,
                invoiceCount: mappedInvoices.length,
                openInvoiceCount,
                totalCollectedKd: FOUR_DP(totalCollected),
                totalDiscountedKd: FOUR_DP(totalDiscounted),
            },
            feedbackSummary,
        };
    }
    async getDailyCollections(params) {
        const { dayStart, dayEnd, dayIsoLocal } = params.date
            ? (() => {
                const { dayStart, dayEnd } = kuwaitDayFromIso(params.date);
                return { dayStart, dayEnd, dayIsoLocal: params.date };
            })()
            : kuwaitDayBounds(new Date());
        const rows = await this.prisma.transactionHistory.findMany({
            where: {
                createdAt: { gte: dayStart, lt: dayEnd },
                type: client_1.LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
                ...(params.agentId ? { performedById: params.agentId } : {}),
            },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                createdAt: true,
                amount: true,
                metadata: true,
                debtAfter: true,
                customer: {
                    select: { id: true, displayName: true, phone: true },
                },
                order: {
                    select: {
                        id: true,
                        serialNumber: true,
                        invoiceNumber: true,
                        posPaymentMethod: true,
                        driver: {
                            select: {
                                id: true,
                                fullName: true,
                                branch: { select: { id: true, name: true } },
                            },
                        },
                    },
                },
                performedBy: {
                    select: { id: true, fullName: true, safariRole: true },
                },
            },
        });
        const events = rows
            .map((r) => {
            const debtSettled = extractDebtSettled(r.metadata);
            const debtDiscount = extractDebtDiscount(r.metadata);
            if (debtSettled.lte(0) && debtDiscount.lte(0))
                return null;
            if (!isManualCallCenterCollectionRow(r.metadata))
                return null;
            const partial = isPartialDebtPaymentRow(r.metadata);
            const kind = partial
                ? 'PARTIAL_DEBT_PAYMENT'
                : 'FULL_ORDER_SETTLEMENT';
            const rawMethod = readMetaString(r.metadata, 'posPaymentMethod') ??
                readMetaString(r.metadata, 'paymentMethod') ??
                r.order?.posPaymentMethod ??
                null;
            const paymentMethod = rawMethod &&
                Object.values(client_1.PosPaymentMethod).includes(rawMethod)
                ? rawMethod
                : null;
            return {
                id: r.id,
                atIso: r.createdAt.toISOString(),
                customerId: r.customer.id,
                customerName: r.customer.displayName ?? null,
                customerPhone: r.customer.phone ?? null,
                orderId: r.order?.id ?? null,
                orderSerial: r.order?.serialNumber ?? r.order?.invoiceNumber ?? null,
                amountCollectedKd: FOUR_DP(debtSettled),
                discountAppliedKd: FOUR_DP(debtDiscount),
                paymentMethod,
                kind,
                performedByUserId: r.performedBy?.id ?? null,
                performedByName: r.performedBy?.fullName ?? null,
                performedByRole: r.performedBy?.safariRole ?? null,
                branchName: r.order?.driver?.branch?.name ?? null,
                driverName: r.order?.driver?.fullName ?? null,
                note: readMetaString(r.metadata, 'note'),
                customerDebtAfterKd: FOUR_DP(r.debtAfter),
            };
        })
            .filter((e) => e !== null);
        const totalCollected = events.reduce((acc, e) => acc.plus(new client_1.Prisma.Decimal(e.amountCollectedKd)), new client_1.Prisma.Decimal(0));
        const totalDiscount = events.reduce((acc, e) => acc.plus(new client_1.Prisma.Decimal(e.discountAppliedKd)), new client_1.Prisma.Decimal(0));
        const uniqueCustomers = new Set(events.map((e) => e.customerId)).size;
        const byAgentMap = new Map();
        for (const e of events) {
            const key = e.performedByUserId ?? '__unattributed__';
            const existing = byAgentMap.get(key);
            if (existing) {
                existing.eventCount += 1;
                existing.customers.add(e.customerId);
                existing.collected = existing.collected.plus(new client_1.Prisma.Decimal(e.amountCollectedKd));
                existing.discount = existing.discount.plus(new client_1.Prisma.Decimal(e.discountAppliedKd));
            }
            else {
                byAgentMap.set(key, {
                    agentId: e.performedByUserId,
                    agentName: e.performedByName,
                    agentRole: e.performedByRole,
                    eventCount: 1,
                    customers: new Set([e.customerId]),
                    collected: new client_1.Prisma.Decimal(e.amountCollectedKd),
                    discount: new client_1.Prisma.Decimal(e.discountAppliedKd),
                });
            }
        }
        const byAgent = Array.from(byAgentMap.values())
            .map((v) => ({
            agentId: v.agentId,
            agentName: v.agentName,
            agentRole: v.agentRole,
            eventCount: v.eventCount,
            uniqueCustomers: v.customers.size,
            collectedKd: FOUR_DP(v.collected),
            discountKd: FOUR_DP(v.discount),
        }))
            .sort((a, b) => new client_1.Prisma.Decimal(b.collectedKd).comparedTo(new client_1.Prisma.Decimal(a.collectedKd)));
        return {
            dayIsoLocal,
            dayStartIso: dayStart.toISOString(),
            dayEndIso: dayEnd.toISOString(),
            totals: {
                eventCount: events.length,
                uniqueCustomers,
                collectedKd: FOUR_DP(totalCollected),
                discountKd: FOUR_DP(totalDiscount),
            },
            byAgent,
            events,
        };
    }
    async getDailyCollectionsReconciliation(params) {
        const { dayStart, dayEnd, dayIsoLocal } = params.date
            ? (() => {
                const { dayStart, dayEnd } = kuwaitDayFromIso(params.date);
                return { dayStart, dayEnd, dayIsoLocal: params.date };
            })()
            : kuwaitDayBounds(new Date());
        const thRows = await this.prisma.transactionHistory.findMany({
            where: {
                createdAt: { gte: dayStart, lt: dayEnd },
                type: client_1.LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
            },
            select: { id: true, orderId: true, metadata: true },
        });
        let thPartialCollected = new client_1.Prisma.Decimal(0);
        let thPartialDiscount = new client_1.Prisma.Decimal(0);
        let thOrderViaLinkCollected = new client_1.Prisma.Decimal(0);
        const thOrderViaLinkOrderIds = new Set();
        for (const r of thRows) {
            const debtSettled = extractDebtSettled(r.metadata);
            const debtDiscount = extractDebtDiscount(r.metadata);
            if (isPartialDebtPaymentRow(r.metadata)) {
                thPartialCollected = thPartialCollected.plus(debtSettled);
                thPartialDiscount = thPartialDiscount.plus(debtDiscount);
                continue;
            }
            if (!r.orderId || debtSettled.lte(0))
                continue;
            const viaLink = isDebtViaLinkRow(r.metadata);
            const reportingCategory = readMetaString(r.metadata, 'reportingCategory');
            const manual = reportingCategory === 'DEBT_COLLECTION_MANUAL';
            const viaLinkCategory = reportingCategory === 'DEBT_COLLECTION_VIA_LINK';
            if (!viaLink && !manual && !viaLinkCategory)
                continue;
            thOrderViaLinkCollected = thOrderViaLinkCollected.plus(debtSettled);
            thOrderViaLinkOrderIds.add(r.orderId);
        }
        const glDebtAdjustments = await this.prisma.generalLedgerEntry.findMany({
            where: {
                createdAt: { gte: dayStart, lt: dayEnd },
                entryType: client_1.GeneralLedgerEntryType.DEBT_ADJUSTMENT,
            },
            select: { amount: true, metadata: true },
        });
        let glPartialCollected = new client_1.Prisma.Decimal(0);
        let glPartialDiscount = new client_1.Prisma.Decimal(0);
        for (const e of glDebtAdjustments) {
            const event = readMetaString(e.metadata, 'event');
            const source = readMetaString(e.metadata, 'source');
            if (source !== 'CC_PARTIAL_DEBT_PAYMENT')
                continue;
            const abs = e.amount.isNegative() ? e.amount.neg() : e.amount;
            if (event === 'DEBT_COLLECTED') {
                glPartialCollected = glPartialCollected.plus(abs);
            }
            else if (event === 'DEBT_DISCOUNTED') {
                glPartialDiscount = glPartialDiscount.plus(abs);
            }
        }
        let glOrderViaLinkCollected = new client_1.Prisma.Decimal(0);
        if (thOrderViaLinkOrderIds.size > 0) {
            const glOrderRows = await this.prisma.generalLedgerEntry.findMany({
                where: {
                    createdAt: { gte: dayStart, lt: dayEnd },
                    entryType: client_1.GeneralLedgerEntryType.POS_SALE_COMPLETED,
                    orderId: { in: Array.from(thOrderViaLinkOrderIds) },
                },
                select: { amount: true },
            });
            for (const e of glOrderRows) {
                glOrderViaLinkCollected = glOrderViaLinkCollected.plus(e.amount);
            }
        }
        const DRIFT_THRESHOLD = new client_1.Prisma.Decimal('0.001');
        const classify = (delta) => {
            const abs = delta.isNegative() ? delta.neg() : delta;
            return abs.gte(DRIFT_THRESHOLD) ? 'DRIFT' : 'MATCH';
        };
        const d1 = glPartialCollected.minus(thPartialCollected);
        const d2 = glPartialDiscount.minus(thPartialDiscount);
        const d3 = glOrderViaLinkCollected.minus(thOrderViaLinkCollected);
        const checks = [
            {
                id: 'partialDebtCollected',
                status: classify(d1),
                transactionHistoryKd: FOUR_DP(thPartialCollected),
                generalLedgerKd: FOUR_DP(glPartialCollected),
                deltaKd: FOUR_DP(d1),
                note: 'TH(debtPaymentOnly=true).debtSettled vs GL(DEBT_ADJUSTMENT.event=DEBT_COLLECTED, source=CC_PARTIAL_DEBT_PAYMENT)',
            },
            {
                id: 'partialDebtDiscount',
                status: classify(d2),
                transactionHistoryKd: FOUR_DP(thPartialDiscount),
                generalLedgerKd: FOUR_DP(glPartialDiscount),
                deltaKd: FOUR_DP(d2),
                note: 'TH(debtPaymentOnly=true).debtDiscount vs GL(DEBT_ADJUSTMENT.event=DEBT_DISCOUNTED, source=CC_PARTIAL_DEBT_PAYMENT)',
            },
            {
                id: 'orderViaLinkCollected',
                status: classify(d3),
                transactionHistoryKd: FOUR_DP(thOrderViaLinkCollected),
                generalLedgerKd: FOUR_DP(glOrderViaLinkCollected),
                deltaKd: FOUR_DP(d3),
                note: 'TH(orderId set, debtSettlementViaLink OR reportingCategory=DEBT_COLLECTION_MANUAL).debtSettled vs GL(POS_SALE_COMPLETED) joined by orderId',
            },
        ];
        const overallStatus = checks.some((c) => c.status === 'DRIFT')
            ? 'DRIFT'
            : 'MATCH';
        return {
            dayIsoLocal,
            dayStartIso: dayStart.toISOString(),
            dayEndIso: dayEnd.toISOString(),
            overallStatus,
            checks,
            totals: {
                transactionHistory: {
                    collectedKd: FOUR_DP(thPartialCollected.plus(thOrderViaLinkCollected)),
                    discountKd: FOUR_DP(thPartialDiscount),
                },
                generalLedger: {
                    collectedKd: FOUR_DP(glPartialCollected.plus(glOrderViaLinkCollected)),
                    discountKd: FOUR_DP(glPartialDiscount),
                },
            },
            generatedAtIso: new Date().toISOString(),
        };
    }
    async getDebtConversionOptions(customerId) {
        const customer = await this.prisma.customer.findUnique({
            where: { id: customerId },
            select: {
                id: true,
                wallet: { select: { balance: true, debt: true } },
            },
        });
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        const plans = await this.prisma.subscriptionPlan.findMany({
            where: { isActive: true },
            orderBy: [{ salePrice: 'asc' }, { name: 'asc' }],
            select: {
                id: true,
                name: true,
                salePrice: true,
                actualBalance: true,
                validityDays: true,
            },
        });
        const currentBalance = customer.wallet?.balance ?? new client_1.Prisma.Decimal(0);
        const walletDebt = customer.wallet?.debt ?? new client_1.Prisma.Decimal(0);
        const implicitAgg = await this.prisma.order.aggregate({
            where: {
                customerId,
                cashStatus: client_1.CashStatus.UNPAID,
                status: { not: client_1.OrderStatus.CANCELED },
                walletSettledAt: null,
            },
            _sum: { totalPrice: true },
        });
        const implicitDebt = implicitAgg._sum.totalPrice ?? new client_1.Prisma.Decimal(0);
        const effectiveCurrentDebt = walletDebt.plus(implicitDebt);
        const zero = new client_1.Prisma.Decimal(0);
        const options = plans.map((p) => {
            const debtToSettle = effectiveCurrentDebt.lt(p.actualBalance)
                ? effectiveCurrentDebt
                : p.actualBalance;
            const ledgerPaid = walletDebt.lt(debtToSettle) ? walletDebt : debtToSettle;
            const implicitPaid = debtToSettle.minus(ledgerPaid);
            const remainingLedger = walletDebt.minus(ledgerPaid);
            const remainingImplicit = implicitDebt.minus(implicitPaid);
            const remainingTotal = remainingLedger.plus(remainingImplicit);
            const rawCredit = p.actualBalance.minus(debtToSettle);
            const creditedToBalance = rawCredit.gt(0) ? rawCredit : zero;
            const projectedBalance = currentBalance.plus(creditedToBalance);
            const subsidy = p.actualBalance.gt(p.salePrice)
                ? p.actualBalance.minus(p.salePrice)
                : zero;
            const convertsDebt = debtToSettle.gt(0);
            const clearsAllDebt = effectiveCurrentDebt.gt(0) && remainingTotal.lte(0);
            const recommended = effectiveCurrentDebt.gt(0) &&
                p.actualBalance.gte(effectiveCurrentDebt);
            return {
                planId: p.id,
                planName: p.name,
                planValidityDays: p.validityDays,
                cashRequiredKd: FOUR_DP(p.salePrice),
                planActualBalanceKd: FOUR_DP(p.actualBalance),
                debtToSettleKd: FOUR_DP(debtToSettle),
                remainingDebtKd: FOUR_DP(remainingTotal),
                creditedToBalanceKd: FOUR_DP(creditedToBalance),
                projectedWalletBalanceKd: FOUR_DP(projectedBalance),
                projectedWalletDebtKd: FOUR_DP(remainingLedger),
                subsidyKd: FOUR_DP(subsidy),
                convertsDebt,
                clearsAllDebt,
                recommended,
            };
        });
        return {
            customerId: customer.id,
            currentDebtKd: FOUR_DP(effectiveCurrentDebt),
            currentBalanceKd: FOUR_DP(currentBalance),
            hasDebt: effectiveCurrentDebt.gt(0),
            options,
        };
    }
    mapSubscriptionChainRows(subs, ordersBySub) {
        return subs.map((s) => ({
            id: s.id,
            status: s.status,
            planNameSnapshot: s.planNameSnapshot,
            planSalePriceSnapshot: s.planSalePriceSnapshot.toFixed(4),
            planActualBalanceSnapshot: s.planActualBalanceSnapshot.toFixed(4),
            planValidityDaysSnapshot: s.planValidityDaysSnapshot,
            carriedBalanceKd: s.carriedBalanceKd.toFixed(4),
            parentSubscriptionId: s.parentSubscriptionId ?? undefined,
            activatedAtIso: s.activatedAt.toISOString(),
            expiresAtIso: s.expiresAt.toISOString(),
            closedAtIso: s.closedAt?.toISOString(),
            closedReason: s.closedReason ?? undefined,
            invoices: ordersBySub.get(s.id) ?? [],
        }));
    }
};
exports.CallCenterService = CallCenterService;
exports.CallCenterService = CallCenterService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        customer_ledger_service_1.CustomerLedgerService,
        payments_service_1.PaymentsService,
        jwt_1.JwtService,
        orders_service_1.OrdersService,
        customer_notifications_service_1.CustomerNotificationsService,
        debt_service_1.DebtService])
], CallCenterService);
//# sourceMappingURL=call-center.service.js.map