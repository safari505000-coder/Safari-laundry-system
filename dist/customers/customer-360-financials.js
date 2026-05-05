"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeCustomerFinancials = computeCustomerFinancials;
exports.computeCustomer360FinancialCore = computeCustomer360FinancialCore;
const client_1 = require("@prisma/client");
const OVERPAYMENT_TOLERANCE_KD = 0.0001;
function round(n) {
    if (!Number.isFinite(n)) {
        return 0;
    }
    return Math.round((n + Number.EPSILON) * 10_000) / 10_000;
}
function fourDp(n) {
    if (!Number.isFinite(n)) {
        return '0.0000';
    }
    return round(n).toFixed(4);
}
function money(value) {
    const n = typeof value === 'number'
        ? value
        : Number.parseFloat(value?.toString() ?? '0');
    return Number.isFinite(n) ? n : 0;
}
function assertPaymentSource(o) {
    const source = o.paymentSource;
    if (source === 'CASH' ||
        source === 'KNET' ||
        source === 'ONLINE' ||
        source === 'WALLET' ||
        source === 'SUBSCRIPTION') {
        return source;
    }
    const id = o.id ? ` ${o.id}` : '';
    throw new Error(`Customer 360 financial engine: missing or invalid paymentSource for order${id}`);
}
function isPaidCashStatus(status) {
    return (status === 'PAID' ||
        status === client_1.CashStatus.PAID_TO_DRIVER ||
        status === client_1.CashStatus.PAID_ONLINE ||
        status === client_1.CashStatus.HANDED_OVER_TO_OFFICE);
}
function isPaidOrder(o) {
    if (o.status === client_1.OrderStatus.CANCELED)
        return false;
    const source = assertPaymentSource(o);
    if (!isPaidCashStatus(o.cashStatus))
        return false;
    if (source === 'WALLET')
        return false;
    if (o.posPaymentMethod === client_1.PosPaymentMethod.DEBT_ON_ACCOUNT)
        return false;
    return true;
}
function isSubscriptionPaidOrder(o, subscriptionId) {
    if (o.status === client_1.OrderStatus.CANCELED)
        return false;
    if (assertPaymentSource(o) !== 'SUBSCRIPTION')
        return false;
    if (!subscriptionId)
        return true;
    return o.subscriptionId === subscriptionId;
}
function orderAmount(o) {
    return money(o.amount ?? o.totalPrice);
}
function computeCustomerFinancials(data) {
    const activeOrders = data.orders.filter((o) => o.status !== client_1.OrderStatus.CANCELED);
    activeOrders.forEach(assertPaymentSource);
    const paidOrderIds = new Set(activeOrders
        .filter((o) => o.id && isPaidOrder(o))
        .map((o) => o.id));
    const totalInvoicesKd = round(activeOrders.reduce((sum, o) => sum + orderAmount(o), 0));
    const orderPaymentsKd = round(activeOrders
        .filter(isPaidOrder)
        .reduce((sum, o) => sum + orderAmount(o), 0));
    const ledgerPaymentsKd = round(data.debtLedger
        .filter((l) => l.source === client_1.DebtSource.PAYMENT || l.source === 'PAYMENT')
        .filter((l) => !l.orderId || !paidOrderIds.has(l.orderId))
        .reduce((sum, l) => sum + Math.abs(money(l.amount)), 0));
    const totalPaymentsKd = round(orderPaymentsKd + ledgerPaymentsKd);
    const overpaymentBalanceKd = totalPaymentsKd > totalInvoicesKd + OVERPAYMENT_TOLERANCE_KD ?
        round(totalPaymentsKd - totalInvoicesKd)
        : 0;
    const totalDueKd = Math.max(round(totalInvoicesKd - totalPaymentsKd), 0);
    const subscriptionId = data.subscription?.id ?? null;
    const subscriptionValueKd = data.subscription ?
        round(money(data.subscription.value ?? data.subscription.planActualBalanceSnapshot))
        : 0;
    const subscriptionConsumedKd = data.subscription ?
        round(activeOrders
            .filter((o) => isSubscriptionPaidOrder(o, subscriptionId))
            .reduce((sum, o) => sum + orderAmount(o), 0))
        : 0;
    const subscriptionRemainingKd = data.subscription ?
        Math.max(round(subscriptionValueKd - subscriptionConsumedKd), 0)
        : 0;
    const anomalyFlags = detectCustomerFinancialAnomalies(data, paidOrderIds, {
        totalInvoicesKd,
        totalPaymentsKd,
        overpaymentBalanceKd,
    });
    return {
        totalInvoicesKd: fourDp(totalInvoicesKd),
        totalPaymentsKd: fourDp(totalPaymentsKd),
        totalDueKd: fourDp(totalDueKd),
        consumedKd: fourDp(totalInvoicesKd),
        subscriptionRemainingKd: fourDp(subscriptionRemainingKd),
        subscription: {
            value: fourDp(subscriptionValueKd),
            consumed: fourDp(subscriptionConsumedKd),
            remaining: fourDp(subscriptionRemainingKd),
        },
        overpaymentBalanceKd: fourDp(overpaymentBalanceKd),
        anomalyFlags,
    };
}
function detectCustomerFinancialAnomalies(data, paidOrderIds, totals) {
    const flags = [];
    for (const ledger of data.debtLedger) {
        if ((ledger.source === client_1.DebtSource.PAYMENT || ledger.source === 'PAYMENT') &&
            ledger.orderId &&
            paidOrderIds.has(ledger.orderId)) {
            flags.push({
                type: 'DOUBLE_COUNT_DETECTED',
                orderId: ledger.orderId,
                amountKd: fourDp(Math.abs(money(ledger.amount))),
                source: 'DEBT_LEDGER_PAYMENT_LINKED_TO_PAID_ORDER',
            });
        }
    }
    const subscriptionId = data.subscription?.id ?? null;
    if (subscriptionId) {
        for (const order of data.orders) {
            if (order.status !== client_1.OrderStatus.CANCELED &&
                order.subscriptionId === subscriptionId &&
                assertPaymentSource(order) !== 'SUBSCRIPTION') {
                flags.push({
                    type: 'SUBSCRIPTION_SOURCE_ANOMALY',
                    orderId: order.id ?? null,
                    amountKd: fourDp(orderAmount(order)),
                    source: String(order.paymentSource ?? order.posPaymentMethod ?? 'UNKNOWN'),
                });
            }
        }
    }
    if (totals.overpaymentBalanceKd > OVERPAYMENT_TOLERANCE_KD) {
        flags.push({
            type: 'OVERPAYMENT_DETECTED',
            amountKd: fourDp(totals.overpaymentBalanceKd),
            source: `payments=${fourDp(totals.totalPaymentsKd)} invoices=${fourDp(totals.totalInvoicesKd)}`,
        });
    }
    return flags;
}
async function computeCustomer360FinancialCore(prisma, customerId) {
    const [orders, ledger, activeSub, customer] = await Promise.all([
        prisma.order.findMany({
            where: { customerId, status: { not: client_1.OrderStatus.CANCELED } },
            select: {
                id: true,
                status: true,
                totalPrice: true,
                cashStatus: true,
                posPaymentMethod: true,
                subscriptionId: true,
            },
        }),
        prisma.debtLedgerEntry.findMany({
            where: { customerId },
            select: { orderId: true, source: true, amount: true },
        }),
        prisma.customerSubscription.findFirst({
            where: { customerId, status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            select: { id: true, planActualBalanceSnapshot: true },
        }),
        prisma.customer.findUnique({
            where: { id: customerId },
            select: { isBlocked: true, blockReason: true, blockedAt: true },
        }),
    ]);
    const fin = computeCustomerFinancials({
        orders: orders.map((order) => ({
            ...order,
            paymentSource: paymentSourceForOrder(order.posPaymentMethod),
        })),
        debtLedger: ledger,
        subscription: activeSub,
    });
    await logFinancialAnomalies(prisma, customerId, fin.anomalyFlags);
    return {
        consumedKd: fin.consumedKd,
        totalInvoicesKd: fin.totalInvoicesKd,
        subscriptionValueKd: fin.subscription.value,
        subscriptionConsumedKd: fin.subscription.consumed,
        subscriptionRemainingKd: fin.subscription.remaining,
        totalPaymentsKd: fin.totalPaymentsKd,
        totalDueKd: fin.totalDueKd,
        overpaymentBalanceKd: fin.overpaymentBalanceKd,
        isBlocked: customer?.isBlocked ?? false,
        blockReason: customer?.blockReason ?? null,
        blockedAtIso: customer?.blockedAt?.toISOString() ?? null,
    };
}
async function logFinancialAnomalies(prisma, customerId, flags) {
    if (flags.length === 0)
        return;
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    for (const flag of flags) {
        const source = flag.orderId ?? flag.source ?? 'customer';
        const existing = await prisma.auditLog.findFirst({
            where: {
                customerId,
                action: flag.type,
                source,
                timestamp: { gte: since },
            },
            select: { id: true },
        });
        if (existing)
            continue;
        await prisma.auditLog.create({
            data: {
                customerId,
                orderId: flag.orderId ?? null,
                action: flag.type,
                resource: 'financial_integrity',
                amount: flag.amountKd ?? null,
                source,
                status: client_1.AuditStatus.SUCCESS,
                changes: flag,
            },
        });
    }
}
function paymentSourceForOrder(method) {
    if (method === client_1.PosPaymentMethod.CASH || method === 'CASH')
        return 'CASH';
    if (method === client_1.PosPaymentMethod.KNET || method === 'KNET')
        return 'KNET';
    if (method === client_1.PosPaymentMethod.ONLINE ||
        method === client_1.PosPaymentMethod.PAYMENT_LINK ||
        method === 'ONLINE' ||
        method === 'PAYMENT_LINK') {
        return 'ONLINE';
    }
    if (method === client_1.PosPaymentMethod.SUBSCRIPTION_WALLET ||
        method === 'SUBSCRIPTION_WALLET') {
        return 'SUBSCRIPTION';
    }
    if (method === client_1.PosPaymentMethod.DEBT_ON_ACCOUNT || method === 'DEBT_ON_ACCOUNT') {
        return 'WALLET';
    }
    throw new Error(`Customer 360 financial engine: missing or invalid order payment method (${method ?? 'null'})`);
}
//# sourceMappingURL=customer-360-financials.js.map