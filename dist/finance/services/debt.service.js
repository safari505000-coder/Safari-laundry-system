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
exports.DebtService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../../prisma/prisma.service");
const subscription_service_1 = require("./subscription.service");
const debt_customer_aggregates_util_1 = require("../debt-customer-aggregates.util");
const debt_ledger_payment_origin_util_1 = require("../debt-ledger-payment-origin.util");
function orderBranchWhereForMarketDebt(branchId) {
    const b = branchId?.trim();
    if (!b)
        return undefined;
    return {
        OR: [
            { driver: { is: { branchId: b } } },
            {
                driverId: null,
                customer: { is: { originBranchId: b } },
            },
        ],
    };
}
function foldMarketUnpaidByMethod(groups) {
    let cash = 0;
    let knet = 0;
    let online = 0;
    let link = 0;
    let other = 0;
    for (const g of groups) {
        const n = Number.parseFloat((g._sum.totalPrice ?? new client_1.Prisma.Decimal(0)).toString());
        if (!Number.isFinite(n) || n === 0)
            continue;
        const p = g.posPaymentMethod;
        if (p === client_1.PosPaymentMethod.CASH)
            cash += n;
        else if (p === client_1.PosPaymentMethod.KNET)
            knet += n;
        else if (p === client_1.PosPaymentMethod.ONLINE)
            online += n;
        else if (p === client_1.PosPaymentMethod.PAYMENT_LINK)
            link += n;
        else
            other += n;
    }
    const f = (x) => x.toFixed(4);
    return {
        cashKd: f(cash),
        knetKd: f(knet),
        onlineKd: f(online),
        paymentLinkKd: f(link),
        otherKd: f(other),
    };
}
let DebtService = class DebtService {
    prisma;
    subscriptionService;
    constructor(prisma, subscriptionService) {
        this.prisma = prisma;
        this.subscriptionService = subscriptionService;
    }
    async getOwnerCustomerWalletSummary() {
        const agg = await this.prisma.customerWallet.aggregate({
            _sum: { balance: true, debt: true },
        });
        const negativeBalanceRows = await this.prisma.customerWallet.findMany({
            where: { balance: { lt: 0 } },
            select: { balance: true },
        });
        const subscriptionDebt = negativeBalanceRows.reduce((acc, row) => {
            const x = Number.parseFloat(row.balance.toString());
            if (!Number.isFinite(x) || x >= 0)
                return acc;
            return acc + Math.abs(x);
        }, 0);
        const debtRows = await this.prisma.debtLedgerEntry.groupBy({
            by: ['source', 'category'],
            _sum: { amount: true },
        });
        let debtFromIssuedInvoices = 0;
        let debtFromSubscriptionOveruse = 0;
        let debtByBranch = 0;
        let debtByDriver = 0;
        let debtByOwner = 0;
        let debtByCallCenter = 0;
        for (const row of debtRows) {
            const amount = Number.parseFloat(row._sum.amount?.toString() ?? '0');
            if (!Number.isFinite(amount) || amount <= 0)
                continue;
            if (row.source === client_1.DebtSource.INVOICE_SHORTFALL)
                debtFromIssuedInvoices += amount;
            else if (row.source === client_1.DebtSource.SUBSCRIPTION_OVERUSE) {
                debtFromSubscriptionOveruse += amount;
            }
            if (row.category === client_1.DebtEntityCategory.BRANCH)
                debtByBranch += amount;
            else if (row.category === client_1.DebtEntityCategory.DRIVER)
                debtByDriver += amount;
            else if (row.category === client_1.DebtEntityCategory.OWNER)
                debtByOwner += amount;
            else if (row.category === client_1.DebtEntityCategory.CALL_CENTER)
                debtByCallCenter += amount;
        }
        const standardInvoiceDebt = Number.parseFloat(agg._sum.debt !== null && agg._sum.debt !== undefined
            ? agg._sum.debt.toString()
            : '0');
        const sub = await this.subscriptionService.getUsageAndSettledDebtTotals();
        return {
            totalWalletLiabilities: agg._sum.balance !== null && agg._sum.balance !== undefined
                ? agg._sum.balance.toString()
                : '0',
            totalCustomerDebts: (standardInvoiceDebt + subscriptionDebt).toFixed(4),
            debtFromIssuedInvoices: debtFromIssuedInvoices.toFixed(4),
            debtFromSubscriptionOveruse: debtFromSubscriptionOveruse.toFixed(4),
            debtSettledBySubscriptions: sub.debtSettledBySubscriptions,
            debtByBranch: debtByBranch.toFixed(4),
            debtByDriver: debtByDriver.toFixed(4),
            debtByOwner: debtByOwner.toFixed(4),
            debtByCallCenter: debtByCallCenter.toFixed(4),
            totalSubscriptionUsage: sub.totalSubscriptionUsage,
        };
    }
    async getDebtBreakdownByCategory(fromIso, toIso, category, branchId, actorUserId) {
        const from = new Date(fromIso);
        const to = new Date(toIso);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
            throw new common_1.BadRequestException('Invalid date range');
        }
        const where = {
            createdAt: { gte: from, lte: to },
            ...(category ? { category } : {}),
            ...(branchId ? { branchId } : {}),
            ...(actorUserId ? { actorUserId } : {}),
        };
        const rows = await this.prisma.debtLedgerEntry.groupBy({
            by: ['category', 'source'],
            where,
            _sum: { amount: true },
            _count: { _all: true },
        });
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            rows: rows.map((r) => ({
                category: r.category,
                source: r.source,
                entryCount: r._count._all,
                totalDebt: r._sum.amount?.toString() ?? '0',
            })),
        };
    }
    async getTotalDebt() {
        const s = await this.getOwnerCustomerWalletSummary();
        return s.totalCustomerDebts;
    }
    async getCustomerDebtSnapshot(customerId) {
        const wallet = await this.prisma.customerWallet.findUnique({
            where: { customerId },
            select: { balance: true, debt: true },
        });
        const walletDebt = Number.parseFloat(wallet?.debt?.toString?.() ?? '0');
        const balance = Number.parseFloat(wallet?.balance?.toString?.() ?? '0');
        const subscriptionOveruseDebt = Number.isFinite(balance) && balance < 0 ? Math.abs(balance) : 0;
        const totalDebt = (Number.isFinite(walletDebt) ? walletDebt : 0) + subscriptionOveruseDebt;
        return {
            walletDebt: (Number.isFinite(walletDebt) ? walletDebt : 0).toFixed(4),
            subscriptionOveruseDebt: subscriptionOveruseDebt.toFixed(4),
            totalDebt: totalDebt.toFixed(4),
        };
    }
    async applyDriverDepositSettlement(driverId, approvedAmountKd) {
        const amount = Number.isFinite(approvedAmountKd) && approvedAmountKd > 0 ? approvedAmountKd : 0;
        if (amount <= 0) {
            return { settledAmountKd: '0.0000', settledOrderCount: 0 };
        }
        const pending = await this.prisma.order.findMany({
            where: {
                driverId,
                status: client_1.OrderStatus.COMPLETED,
                cashStatus: client_1.CashStatus.PAID_TO_DRIVER,
                posPaymentMethod: client_1.PosPaymentMethod.CASH,
            },
            orderBy: { completedAt: 'asc' },
            select: { id: true, totalPrice: true },
            take: 5000,
        });
        let remaining = amount;
        const settleIds = [];
        let settledAmount = 0;
        for (const row of pending) {
            const v = Number.parseFloat(row.totalPrice.toString());
            if (!Number.isFinite(v) || v <= 0)
                continue;
            if (v <= remaining + 0.0001) {
                settleIds.push(row.id);
                settledAmount += v;
                remaining -= v;
            }
            if (remaining <= 0.0001)
                break;
        }
        if (settleIds.length > 0) {
            await this.prisma.order.updateMany({
                where: { id: { in: settleIds }, cashStatus: client_1.CashStatus.PAID_TO_DRIVER },
                data: { cashStatus: client_1.CashStatus.HANDED_OVER_TO_OFFICE },
            });
        }
        return {
            settledAmountKd: settledAmount.toFixed(4),
            settledOrderCount: settleIds.length,
        };
    }
    async getUnpaidInvoices(query) {
        await this.logSuspiciousDebtPayments();
        const from = query.from ? new Date(query.from) : null;
        const to = query.to ? new Date(query.to) : null;
        if (from && Number.isNaN(from.getTime())) {
            throw new common_1.BadRequestException('Invalid `from` date');
        }
        if (to && Number.isNaN(to.getTime())) {
            throw new common_1.BadRequestException('Invalid `to` date');
        }
        const phone = (query.customerPhone ?? '').replace(/\D+/g, '').trim();
        const where = {
            source: { in: [client_1.DebtSource.INVOICE_SHORTFALL, client_1.DebtSource.SUBSCRIPTION_OVERUSE] },
            orderId: { not: null },
            ...(from || to
                ? {
                    createdAt: {
                        ...(from ? { gte: from } : {}),
                        ...(to ? { lte: to } : {}),
                    },
                }
                : {}),
            ...(query.branchId ? { branchId: query.branchId } : {}),
            ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
            ...(phone
                ? {
                    customer: {
                        OR: [{ phone: { contains: phone } }, { phone2: { contains: phone } }],
                    },
                }
                : {}),
        };
        const entries = await this.prisma.debtLedgerEntry.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 20_000,
            select: {
                id: true,
                source: true,
                amount: true,
                createdAt: true,
                orderId: true,
                customerId: true,
                branchId: true,
                actorUserId: true,
                customer: {
                    select: {
                        id: true,
                        displayName: true,
                        phone: true,
                        phone2: true,
                    },
                },
                branch: {
                    select: { id: true, name: true },
                },
                actorUser: {
                    select: {
                        id: true,
                        fullName: true,
                        username: true,
                        safariRole: true,
                    },
                },
                order: {
                    select: {
                        id: true,
                        serialNumber: true,
                        invoiceNumber: true,
                        totalPrice: true,
                        createdAt: true,
                        completedAt: true,
                        posPaymentMethod: true,
                    },
                },
            },
        });
        const byOrder = new Map();
        for (const e of entries) {
            if (!e.orderId || !e.order)
                continue;
            const amount = Number.parseFloat(e.amount.toString());
            if (!Number.isFinite(amount) || amount <= 0)
                continue;
            const tIso = e.createdAt.toISOString();
            const isShort = e.source === client_1.DebtSource.INVOICE_SHORTFALL;
            const ex = byOrder.get(e.orderId);
            if (ex) {
                if (isShort) {
                    ex.shortSum += amount;
                    ex.entryCountShort += 1;
                    if (tIso > ex.lastEntryShort)
                        ex.lastEntryShort = tIso;
                }
                else {
                    ex.subSum += amount;
                    ex.entryCountSub += 1;
                    if (tIso > ex.lastEntrySub)
                        ex.lastEntrySub = tIso;
                }
                continue;
            }
            const actorRole = e.actorUser?.safariRole != null
                ? String(e.actorUser.safariRole)
                : null;
            const baseRow = {
                orderId: e.order.id,
                serialNumber: e.order.serialNumber ?? null,
                invoiceNumber: e.order.invoiceNumber ?? null,
                issuedAt: (e.order.completedAt ?? e.order.createdAt).toISOString(),
                customerId: e.customer.id,
                customerName: e.customer.displayName ?? e.customer.phone ?? '—',
                customerPhone: e.customer.phone ?? null,
                customerPhone2: e.customer.phone2 ?? null,
                branchId: e.branch?.id ?? null,
                branchName: e.branch?.name ?? null,
                actorUserId: e.actorUser?.id ?? null,
                actorUserName: e.actorUser?.fullName ?? null,
                actorUserRole: actorRole,
                invoiceTotalKd: e.order.totalPrice.toString(),
                debtAmountKd: '0',
                paidKd: '0',
                remainingKd: '0',
                entryCount: 1,
                currentCustomerDebtKd: '0',
                isOpen: true,
                lastEntryAt: tIso,
                debtSource: 'INVOICE_SHORTFALL',
                posPaymentMethod: e.order.posPaymentMethod
                    ? String(e.order.posPaymentMethod)
                    : null,
            };
            byOrder.set(e.orderId, {
                shortSum: isShort ? amount : 0,
                subSum: isShort ? 0 : amount,
                lastEntryShort: isShort ? tIso : '',
                lastEntrySub: isShort ? '' : tIso,
                entryCountShort: isShort ? 1 : 0,
                entryCountSub: isShort ? 0 : 1,
                row: baseRow,
            });
        }
        const orderIds = Array.from(byOrder.keys());
        const customerIds = Array.from(new Set(Array.from(byOrder.values()).map((x) => x.row.customerId)));
        const [paymentEntries, customerLedgerTotals] = await Promise.all([
            orderIds.length
                ? this.prisma.debtLedgerEntry.findMany({
                    where: {
                        source: client_1.DebtSource.PAYMENT,
                        orderId: { in: orderIds },
                    },
                    select: {
                        orderId: true,
                        source: true,
                        amount: true,
                        actorUserId: true,
                        sourceRef: true,
                        note: true,
                    },
                })
                : Promise.resolve([]),
            customerIds.length
                ? this.prisma.debtLedgerEntry.findMany({
                    where: { customerId: { in: customerIds } },
                    select: {
                        customerId: true,
                        source: true,
                        amount: true,
                        actorUserId: true,
                        sourceRef: true,
                        note: true,
                    },
                })
                : Promise.resolve([]),
        ]);
        const paidByOrder = new Map();
        for (const g of paymentEntries) {
            if (!g.orderId)
                continue;
            if (!(0, debt_ledger_payment_origin_util_1.isRealDebtLedgerPayment)(g))
                continue;
            const paid = Number.parseFloat(g.amount?.toString() ?? '0');
            if (!Number.isFinite(paid))
                continue;
            paidByOrder.set(g.orderId, (paidByOrder.get(g.orderId) ?? 0) + paid);
        }
        const perCustomer = new Map();
        for (const g of customerLedgerTotals) {
            const cur = perCustomer.get(g.customerId) ?? { debt: 0, payment: 0 };
            const v = Number.parseFloat(g.amount?.toString() ?? '0');
            if (!Number.isFinite(v))
                continue;
            if (g.source === client_1.DebtSource.PAYMENT) {
                if ((0, debt_ledger_payment_origin_util_1.isRealDebtLedgerPayment)(g))
                    cur.payment += v;
            }
            else
                cur.debt += v;
            perCustomer.set(g.customerId, cur);
        }
        const finalRows = [];
        let totalDebt = 0;
        let totalPaid = 0;
        let openDebt = 0;
        let openShortfallDebt = 0;
        let openSubDebt = 0;
        let openUnpaidOrderBalance = 0;
        let totalInvOrderSum = 0;
        const orderInvTallied = new Set();
        let openInvoiceCount = 0;
        const openCustomers = new Set();
        for (const cid of customerIds) {
            const custAggs = Array.from(byOrder.values()).filter((a) => a.row.customerId === cid);
            custAggs.sort((a, b) => new Date(a.row.issuedAt).getTime() -
                new Date(b.row.issuedAt).getTime());
            const shortQ = [];
            const subQ = [];
            for (const agg of custAggs) {
                const payO = paidByOrder.get(agg.row.orderId) ?? 0;
                const S = agg.shortSum;
                const T = agg.subSum;
                const dS = Math.min(payO, S);
                const sNet = Math.max(0, S - dS);
                const remPay = payO - dS;
                const dT = Math.min(Math.max(0, remPay), T);
                const tNet = Math.max(0, T - dT);
                const issued = agg.row.issuedAt;
                if (S > 0) {
                    shortQ.push({
                        agg,
                        sNet,
                        tNet,
                        directShort: dS,
                        directSub: dT,
                        grossS: S,
                        grossT: T,
                        issuedAt: issued,
                    });
                }
                if (T > 0) {
                    subQ.push({
                        agg,
                        sNet,
                        tNet,
                        directShort: dS,
                        directSub: dT,
                        grossS: S,
                        grossT: T,
                        issuedAt: issued,
                    });
                }
            }
            shortQ.sort((a, b) => new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime());
            subQ.sort((a, b) => new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime());
            const custTotals = perCustomer.get(cid) ?? { debt: 0, payment: 0 };
            const custOpen = Math.max(custTotals.debt - custTotals.payment, 0);
            let rem = custOpen;
            const pushRow = (x, kind, perOrderNet, directPart, gross, lastAt, entryCount) => {
                const share = Math.min(perOrderNet, rem);
                rem -= share;
                const fifo = perOrderNet - share;
                const invoicePaid = directPart + fifo;
                const remaining = share;
                const invTotal = Number.parseFloat(x.agg.row.invoiceTotalKd);
                if (Number.isFinite(invTotal) && !orderInvTallied.has(x.agg.row.orderId)) {
                    totalInvOrderSum += invTotal;
                    orderInvTallied.add(x.agg.row.orderId);
                }
                const isOpen = remaining > 0.0001;
                const r = {
                    ...x.agg.row,
                    debtSource: kind,
                    debtAmountKd: gross.toFixed(4),
                    paidKd: invoicePaid.toFixed(4),
                    remainingKd: remaining.toFixed(4),
                    currentCustomerDebtKd: custOpen.toFixed(4),
                    isOpen,
                    entryCount,
                    lastEntryAt: lastAt || x.agg.row.issuedAt,
                };
                totalDebt += gross;
                totalPaid += invoicePaid;
                if (isOpen) {
                    openDebt += remaining;
                    openInvoiceCount += 1;
                    openCustomers.add(x.agg.row.customerId);
                    if (kind === 'INVOICE_SHORTFALL')
                        openShortfallDebt += remaining;
                    else
                        openSubDebt += remaining;
                }
                finalRows.push(r);
            };
            for (const x of shortQ) {
                pushRow(x, 'INVOICE_SHORTFALL', x.sNet, x.directShort, x.grossS, x.agg.lastEntryShort, x.agg.entryCountShort);
            }
            for (const x of subQ) {
                pushRow(x, 'SUBSCRIPTION_OVERUSE', x.tNet, x.directSub, x.grossT, x.agg.lastEntrySub, x.agg.entryCountSub);
            }
        }
        const orderIdsCovered = new Set(finalRows.map((r) => r.orderId));
        const listScope = query.branchId?.trim() || query.marketKpiBranchId?.trim() || null;
        const orderDateWhere = from || to
            ? {
                OR: [
                    {
                        completedAt: {
                            ...(from ? { gte: from } : {}),
                            ...(to ? { lte: to } : {}),
                        },
                    },
                    {
                        AND: [
                            { completedAt: null },
                            {
                                createdAt: {
                                    ...(from ? { gte: from } : {}),
                                    ...(to ? { lte: to } : {}),
                                },
                            },
                        ],
                    },
                ],
            }
            : undefined;
        const phoneWhere = phone
            ? {
                customer: {
                    OR: [{ phone: { contains: phone } }, { phone2: { contains: phone } }],
                },
            }
            : undefined;
        const baseOrderUnpaid = {
            cashStatus: client_1.CashStatus.UNPAID,
            status: { not: client_1.OrderStatus.CANCELED },
            ...(orderBranchWhereForMarketDebt(listScope ?? undefined) ?? {}),
            ...(orderDateWhere ? orderDateWhere : {}),
            ...(phoneWhere ? phoneWhere : {}),
        };
        if (orderIdsCovered.size > 0) {
            baseOrderUnpaid.id = {
                notIn: Array.from(orderIdsCovered),
            };
        }
        if (query.actorUserId) {
            const actor = await this.prisma.user.findUnique({
                where: { id: query.actorUserId },
                select: { safariRole: true },
            });
            if (actor?.safariRole === client_1.SafariRole.DRIVER) {
                baseOrderUnpaid.driverId = query.actorUserId;
            }
        }
        const unlinkedUnpaid = await this.prisma.order.findMany({
            where: baseOrderUnpaid,
            take: 5_000,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                totalPrice: true,
                createdAt: true,
                completedAt: true,
                serialNumber: true,
                invoiceNumber: true,
                posPaymentMethod: true,
                customerId: true,
                driverId: true,
                customer: {
                    select: {
                        id: true,
                        displayName: true,
                        phone: true,
                        phone2: true,
                        originBranch: { select: { id: true, name: true } },
                    },
                },
                driver: {
                    select: {
                        id: true,
                        fullName: true,
                        username: true,
                        safariRole: true,
                        branch: { select: { id: true, name: true } },
                    },
                },
            },
        });
        if (unlinkedUnpaid.length > 0) {
            const needCust = Array.from(new Set(unlinkedUnpaid
                .map((o) => o.customerId)
                .filter((cid) => !perCustomer.has(cid))));
            if (needCust.length) {
                const moreTotals = await this.prisma.debtLedgerEntry.findMany({
                    where: { customerId: { in: needCust } },
                    select: {
                        customerId: true,
                        source: true,
                        amount: true,
                        actorUserId: true,
                        sourceRef: true,
                        note: true,
                    },
                });
                for (const g of moreTotals) {
                    const cur = perCustomer.get(g.customerId) ?? { debt: 0, payment: 0 };
                    const v = Number.parseFloat(g.amount?.toString() ?? '0');
                    if (!Number.isFinite(v))
                        continue;
                    if (g.source === client_1.DebtSource.PAYMENT) {
                        if ((0, debt_ledger_payment_origin_util_1.isRealDebtLedgerPayment)(g))
                            cur.payment += v;
                    }
                    else
                        cur.debt += v;
                    perCustomer.set(g.customerId, cur);
                }
            }
        }
        const ordersWithoutDriver = unlinkedUnpaid
            .filter((o) => !o.driverId)
            .map((o) => o.id);
        const issuerFromSettlement = new Map();
        if (ordersWithoutDriver.length > 0) {
            const settlements = await this.prisma.transactionHistory.findMany({
                where: {
                    orderId: { in: ordersWithoutDriver },
                    type: client_1.LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
                    performedById: { not: null },
                },
                orderBy: { createdAt: 'desc' },
                select: {
                    orderId: true,
                    performedBy: {
                        select: { id: true, fullName: true, safariRole: true },
                    },
                },
            });
            for (const h of settlements) {
                if (!h.orderId || !h.performedBy)
                    continue;
                if (!issuerFromSettlement.has(h.orderId)) {
                    issuerFromSettlement.set(h.orderId, h.performedBy);
                }
            }
        }
        for (const o of unlinkedUnpaid) {
            const tot = Number.parseFloat(o.totalPrice.toString());
            if (!Number.isFinite(tot) || tot <= 0)
                continue;
            const branchName = o.driver?.branch?.name?.trim() || o.customer.originBranch?.name?.trim() || null;
            const branchId = o.driver?.branch?.id?.trim() ?? o.customer.originBranch?.id ?? null;
            const settlementActor = issuerFromSettlement.get(o.id);
            const actorUserId = o.driver?.id ?? settlementActor?.id ?? null;
            const actorUserName = o.driver?.fullName?.trim() ?? settlementActor?.fullName?.trim() ?? null;
            const actorUserRole = o.driver?.safariRole != null
                ? String(o.driver.safariRole)
                : settlementActor?.safariRole != null
                    ? String(settlementActor.safariRole)
                    : null;
            const issued = (o.completedAt ?? o.createdAt).toISOString();
            const ct = perCustomer.get(o.customerId) ?? { debt: 0, payment: 0 };
            const custOpen = Math.max(ct.debt - ct.payment, 0);
            const row = {
                orderId: o.id,
                serialNumber: o.serialNumber ?? null,
                invoiceNumber: o.invoiceNumber ?? null,
                issuedAt: issued,
                customerId: o.customerId,
                customerName: o.customer.displayName?.trim() || o.customer.phone,
                customerPhone: o.customer.phone,
                customerPhone2: o.customer.phone2 ?? null,
                branchId,
                branchName,
                actorUserId,
                actorUserName,
                actorUserRole,
                invoiceTotalKd: o.totalPrice.toString(),
                debtAmountKd: tot.toFixed(4),
                paidKd: '0.0000',
                remainingKd: tot.toFixed(4),
                entryCount: 0,
                currentCustomerDebtKd: custOpen.toFixed(4),
                isOpen: true,
                lastEntryAt: issued,
                debtSource: 'OPEN_UNPAID_ORDER',
                posPaymentMethod: o.posPaymentMethod
                    ? String(o.posPaymentMethod)
                    : null,
            };
            finalRows.push(row);
            totalDebt += tot;
            totalInvOrderSum += tot;
            orderInvTallied.add(o.id);
            openDebt += tot;
            openUnpaidOrderBalance += tot;
            openInvoiceCount += 1;
            openCustomers.add(o.customerId);
        }
        const debtSourceSortRank = (s) => {
            if (s === 'INVOICE_SHORTFALL')
                return 0;
            if (s === 'SUBSCRIPTION_OVERUSE')
                return 1;
            return 2;
        };
        finalRows.sort((a, b) => {
            if (a.isOpen !== b.isOpen)
                return a.isOpen ? -1 : 1;
            const tb = new Date(b.issuedAt).getTime();
            const ta = new Date(a.issuedAt).getTime();
            if (tb !== ta)
                return tb - ta;
            if (a.orderId !== b.orderId)
                return a.orderId.localeCompare(b.orderId);
            if (a.debtSource === b.debtSource)
                return 0;
            return debtSourceSortRank(a.debtSource) - debtSourceSortRank(b.debtSource);
        });
        const invoiceCount = finalRows.length;
        const customerCount = new Set(finalRows.map((r) => r.customerId)).size;
        const avgDebtPerInvoice = invoiceCount > 0 ? totalDebt / invoiceCount : 0;
        const marketKpiScope = query.marketKpiBranchId?.trim() || query.branchId?.trim() || null;
        const marketBaseWhere = {
            cashStatus: client_1.CashStatus.UNPAID,
            status: { not: client_1.OrderStatus.CANCELED },
            ...(orderBranchWhereForMarketDebt(marketKpiScope ?? undefined) ?? {}),
        };
        const [marketAgg, byMethod] = await Promise.all([
            this.prisma.order.aggregate({
                where: marketBaseWhere,
                _sum: { totalPrice: true },
            }),
            this.prisma.order.groupBy({
                by: ['posPaymentMethod'],
                where: marketBaseWhere,
                _sum: { totalPrice: true },
            }),
        ]);
        const totalMarketUnpaidKd = (marketAgg._sum.totalPrice ?? new client_1.Prisma.Decimal(0)).toFixed(4);
        const marketUnpaidByMethod = foldMarketUnpaidByMethod(byMethod);
        return {
            from: from ? from.toISOString() : null,
            to: to ? to.toISOString() : null,
            kpis: {
                invoiceCount,
                openInvoiceCount,
                customerCount,
                openCustomerCount: openCustomers.size,
                totalInvoicesKd: totalInvOrderSum.toFixed(4),
                totalDebtKd: totalDebt.toFixed(4),
                totalPaidKd: totalPaid.toFixed(4),
                openDebtKd: openDebt.toFixed(4),
                openShortfallDebtKd: openShortfallDebt.toFixed(4),
                openSubscriptionOveruseDebtKd: openSubDebt.toFixed(4),
                openUnpaidOrderBalanceKd: openUnpaidOrderBalance.toFixed(4),
                totalMarketUnpaidKd,
                marketUnpaidByMethod,
                avgDebtPerInvoiceKd: avgDebtPerInvoice.toFixed(4),
            },
            rows: finalRows,
        };
    }
    async logSuspiciousDebtPayments() {
        const suspicious = await this.prisma.debtLedgerEntry.findMany({
            where: {
                source: client_1.DebtSource.PAYMENT,
                OR: [
                    { orderId: null },
                    { actorUserId: null },
                    { sourceRef: null },
                    { note: null },
                    { amount: new client_1.Prisma.Decimal('0.5000') },
                ],
            },
            select: {
                id: true,
                customerId: true,
                orderId: true,
                amount: true,
                actorUserId: true,
                sourceRef: true,
                note: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
        for (const entry of suspicious) {
            console.error('[SUSPICIOUS_PAYMENT]', {
                ...entry,
                amount: entry.amount.toString(),
                createdAt: entry.createdAt.toISOString(),
            });
        }
    }
    async getCustomerNetDebtFromDebtLedger(customerId, tx) {
        const db = tx ?? this.prisma;
        return (0, debt_customer_aggregates_util_1.getCustomerNetDebtFromDebtLedgerAgg)(db, customerId);
    }
    async getLedgerOpenDebtByCategory(whereExtra) {
        const z = new client_1.Prisma.Decimal(0);
        const rows = await this.prisma.debtLedgerEntry.findMany({
            where: whereExtra ?? {},
            select: {
                customerId: true,
                source: true,
                amount: true,
                actorUserId: true,
                sourceRef: true,
                note: true,
            },
        });
        const byCustomer = new Map();
        for (const r of rows) {
            const amt = new client_1.Prisma.Decimal(r.amount?.toString() ?? '0');
            const cur = byCustomer.get(r.customerId) ?? {
                inv: new client_1.Prisma.Decimal(0),
                sub: new client_1.Prisma.Decimal(0),
                pay: new client_1.Prisma.Decimal(0),
            };
            if (r.source === client_1.DebtSource.INVOICE_SHORTFALL)
                cur.inv = cur.inv.add(amt);
            else if (r.source === client_1.DebtSource.SUBSCRIPTION_OVERUSE)
                cur.sub = cur.sub.add(amt);
            else if (r.source === client_1.DebtSource.PAYMENT && (0, debt_ledger_payment_origin_util_1.isRealDebtLedgerPayment)(r))
                cur.pay = cur.pay.add(amt);
            byCustomer.set(r.customerId, cur);
        }
        let openInv = z;
        let openSub = z;
        for (const { inv, sub, pay } of byCustomer.values()) {
            const invPaid = inv.lessThanOrEqualTo(pay) ? inv : pay;
            const payAfterInv = pay.sub(invPaid);
            const subPaid = sub.lessThanOrEqualTo(payAfterInv) ? sub : payAfterInv;
            const remInv = inv.sub(invPaid);
            const remSub = sub.sub(subPaid);
            if (remInv.gt(0))
                openInv = openInv.add(remInv);
            if (remSub.gt(0))
                openSub = openSub.add(remSub);
        }
        return {
            outstandingInvoiceDebtKd: openInv.toFixed(4),
            outstandingSubscriptionDebtKd: openSub.toFixed(4),
        };
    }
    async getOpenDebtByIssuer(branchId) {
        const where = {
            source: client_1.DebtSource.INVOICE_SHORTFALL,
            orderId: { not: null },
            ...(branchId ? { branchId } : {}),
        };
        const entries = await this.prisma.debtLedgerEntry.findMany({
            where,
            select: {
                orderId: true,
                customerId: true,
                amount: true,
                createdAt: true,
                actorUser: { select: { safariRole: true } },
            },
            take: 20_000,
        });
        const byOrder = new Map();
        for (const e of entries) {
            if (!e.orderId)
                continue;
            const amt = Number.parseFloat(e.amount.toString());
            if (!Number.isFinite(amt) || amt <= 0)
                continue;
            const existing = byOrder.get(e.orderId);
            if (existing) {
                existing.debt += amt;
                continue;
            }
            byOrder.set(e.orderId, {
                orderId: e.orderId,
                customerId: e.customerId,
                debt: amt,
                createdAt: e.createdAt,
                issuerRole: e.actorUser?.safariRole ?? null,
            });
        }
        const orders = Array.from(byOrder.values());
        if (orders.length === 0) {
            return {
                rows: [
                    { issuer: 'DRIVER', openDebtKd: '0.0000', openInvoiceCount: 0, openCustomerCount: 0 },
                    { issuer: 'BRANCH', openDebtKd: '0.0000', openInvoiceCount: 0, openCustomerCount: 0 },
                    { issuer: 'OTHER', openDebtKd: '0.0000', openInvoiceCount: 0, openCustomerCount: 0 },
                ],
                totalOpenDebtKd: '0.0000',
                openInvoiceCount: 0,
                openCustomerCount: 0,
                computedAt: new Date().toISOString(),
            };
        }
        const customerIds = Array.from(new Set(orders.map((o) => o.customerId)));
        const [paymentsByOrder, perCustomerTotals] = await Promise.all([
            this.prisma.debtLedgerEntry.findMany({
                where: {
                    source: client_1.DebtSource.PAYMENT,
                    orderId: { in: orders.map((o) => o.orderId) },
                },
                select: {
                    orderId: true,
                    source: true,
                    amount: true,
                    actorUserId: true,
                    sourceRef: true,
                    note: true,
                },
            }),
            this.prisma.debtLedgerEntry.findMany({
                where: { customerId: { in: customerIds } },
                select: {
                    customerId: true,
                    source: true,
                    amount: true,
                    actorUserId: true,
                    sourceRef: true,
                    note: true,
                },
            }),
        ]);
        const paidByOrder = new Map();
        for (const g of paymentsByOrder) {
            if (!g.orderId)
                continue;
            if (!(0, debt_ledger_payment_origin_util_1.isRealDebtLedgerPayment)(g))
                continue;
            const amount = Number.parseFloat(g.amount?.toString() ?? '0');
            if (!Number.isFinite(amount))
                continue;
            paidByOrder.set(g.orderId, (paidByOrder.get(g.orderId) ?? 0) + amount);
        }
        const perCustomer = new Map();
        for (const g of perCustomerTotals) {
            const cur = perCustomer.get(g.customerId) ?? { debt: 0, payment: 0 };
            const v = Number.parseFloat(g.amount?.toString() ?? '0');
            if (!Number.isFinite(v))
                continue;
            if (g.source === client_1.DebtSource.PAYMENT) {
                if ((0, debt_ledger_payment_origin_util_1.isRealDebtLedgerPayment)(g))
                    cur.payment += v;
            }
            else
                cur.debt += v;
            perCustomer.set(g.customerId, cur);
        }
        const ordersByCustomer = new Map();
        for (const o of orders) {
            const arr = ordersByCustomer.get(o.customerId) ?? [];
            arr.push(o);
            ordersByCustomer.set(o.customerId, arr);
        }
        const buckets = {
            DRIVER: { open: 0, invoices: 0, customers: new Set() },
            BRANCH: { open: 0, invoices: 0, customers: new Set() },
            OTHER: { open: 0, invoices: 0, customers: new Set() },
        };
        let totalOpen = 0;
        let totalInvoices = 0;
        const allOpenCustomers = new Set();
        for (const [cid, arr] of ordersByCustomer) {
            arr.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
            const totals = perCustomer.get(cid) ?? { debt: 0, payment: 0 };
            let pool = Math.max(totals.debt - totals.payment, 0);
            for (const o of arr) {
                const paid = paidByOrder.get(o.orderId) ?? 0;
                const perOrderNet = Math.max(o.debt - paid, 0);
                const share = Math.min(perOrderNet, pool);
                pool -= share;
                if (share <= 0.0001)
                    continue;
                const bucketKey = o.issuerRole === client_1.SafariRole.DRIVER
                    ? 'DRIVER'
                    : o.issuerRole === client_1.SafariRole.MANAGER ||
                        o.issuerRole === client_1.SafariRole.SUPERVISOR
                        ? 'BRANCH'
                        : 'OTHER';
                const b = buckets[bucketKey];
                b.open += share;
                b.invoices += 1;
                b.customers.add(cid);
                totalOpen += share;
                totalInvoices += 1;
                allOpenCustomers.add(cid);
            }
        }
        const rows = ['DRIVER', 'BRANCH', 'OTHER'].map((k) => ({
            issuer: k,
            openDebtKd: buckets[k].open.toFixed(4),
            openInvoiceCount: buckets[k].invoices,
            openCustomerCount: buckets[k].customers.size,
        }));
        return {
            rows,
            totalOpenDebtKd: totalOpen.toFixed(4),
            openInvoiceCount: totalInvoices,
            openCustomerCount: allOpenCustomers.size,
            computedAt: new Date().toISOString(),
        };
    }
};
exports.DebtService = DebtService;
exports.DebtService = DebtService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        subscription_service_1.SubscriptionService])
], DebtService);
//# sourceMappingURL=debt.service.js.map