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
            source: client_1.DebtSource.INVOICE_SHORTFALL,
            orderId: { not: null },
            actorUser: {
                is: {
                    safariRole: { in: [client_1.SafariRole.DRIVER, client_1.SafariRole.MANAGER] },
                },
            },
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
            const existing = byOrder.get(e.orderId);
            if (existing) {
                existing.debtSum += amount;
                existing.row.entryCount += 1;
                if (new Date(e.createdAt) > new Date(existing.row.lastEntryAt)) {
                    existing.row.lastEntryAt = e.createdAt.toISOString();
                }
                continue;
            }
            const actorRole = e.actorUser?.safariRole != null
                ? String(e.actorUser.safariRole)
                : null;
            byOrder.set(e.orderId, {
                debtSum: amount,
                row: {
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
                    lastEntryAt: e.createdAt.toISOString(),
                },
            });
        }
        const orderIds = Array.from(byOrder.keys());
        const customerIds = Array.from(new Set(Array.from(byOrder.values()).map((x) => x.row.customerId)));
        const [paymentsByOrder, customerLedgerTotals] = await Promise.all([
            orderIds.length
                ? this.prisma.debtLedgerEntry.groupBy({
                    by: ['orderId'],
                    where: {
                        source: client_1.DebtSource.PAYMENT,
                        orderId: { in: orderIds },
                    },
                    _sum: { amount: true },
                })
                : Promise.resolve([]),
            customerIds.length
                ? this.prisma.debtLedgerEntry.groupBy({
                    by: ['customerId', 'source'],
                    where: { customerId: { in: customerIds } },
                    _sum: { amount: true },
                })
                : Promise.resolve([]),
        ]);
        const paidByOrder = new Map();
        for (const g of paymentsByOrder) {
            if (!g.orderId)
                continue;
            const paid = Number.parseFloat(g._sum.amount?.toString() ?? '0');
            paidByOrder.set(g.orderId, Number.isFinite(paid) ? paid : 0);
        }
        const perCustomer = new Map();
        for (const g of customerLedgerTotals) {
            const cur = perCustomer.get(g.customerId) ?? { debt: 0, payment: 0 };
            const v = Number.parseFloat(g._sum.amount?.toString() ?? '0');
            if (!Number.isFinite(v))
                continue;
            if (g.source === client_1.DebtSource.PAYMENT)
                cur.payment += v;
            else
                cur.debt += v;
            perCustomer.set(g.customerId, cur);
        }
        const customerUnallocated = new Map();
        for (const cid of customerIds) {
            const totals = perCustomer.get(cid) ?? { debt: 0, payment: 0 };
            customerUnallocated.set(cid, Math.max(totals.debt - totals.payment, 0));
        }
        const ordersByCustomer = new Map();
        for (const v of byOrder.values()) {
            const arr = ordersByCustomer.get(v.row.customerId) ?? [];
            arr.push(v);
            ordersByCustomer.set(v.row.customerId, arr);
        }
        for (const arr of ordersByCustomer.values()) {
            arr.sort((a, b) => new Date(a.row.issuedAt).getTime() -
                new Date(b.row.issuedAt).getTime());
        }
        const finalRows = [];
        let totalDebt = 0;
        let totalPaid = 0;
        let openDebt = 0;
        let totalInvoices = 0;
        let openInvoiceCount = 0;
        const openCustomers = new Set();
        for (const [cid, arr] of ordersByCustomer) {
            const custTotals = perCustomer.get(cid) ?? { debt: 0, payment: 0 };
            const custOpen = Math.max(custTotals.debt - custTotals.payment, 0);
            let remainingCustomerOpen = custOpen;
            for (const v of arr) {
                const paidForOrder = paidByOrder.get(v.row.orderId) ?? 0;
                const perOrderNet = Math.max(v.debtSum - paidForOrder, 0);
                const shareOfCustomerOpen = Math.min(perOrderNet, remainingCustomerOpen);
                remainingCustomerOpen -= shareOfCustomerOpen;
                const perOrderFifoShare = perOrderNet - shareOfCustomerOpen;
                const invoicePaid = paidForOrder + perOrderFifoShare;
                const invoiceRemaining = shareOfCustomerOpen;
                v.row.debtAmountKd = v.debtSum.toFixed(4);
                v.row.paidKd = invoicePaid.toFixed(4);
                v.row.remainingKd = invoiceRemaining.toFixed(4);
                v.row.currentCustomerDebtKd = custOpen.toFixed(4);
                v.row.isOpen = shareOfCustomerOpen > 0.0001;
                totalDebt += v.debtSum;
                totalPaid += invoicePaid;
                const invTotal = Number.parseFloat(v.row.invoiceTotalKd);
                if (Number.isFinite(invTotal))
                    totalInvoices += invTotal;
                if (v.row.isOpen) {
                    openDebt += invoiceRemaining;
                    openInvoiceCount += 1;
                    openCustomers.add(v.row.customerId);
                }
                finalRows.push(v.row);
            }
        }
        finalRows.sort((a, b) => {
            if (a.isOpen !== b.isOpen)
                return a.isOpen ? -1 : 1;
            return new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime();
        });
        const invoiceCount = finalRows.length;
        const customerCount = new Set(finalRows.map((r) => r.customerId)).size;
        const avgDebtPerInvoice = invoiceCount > 0 ? totalDebt / invoiceCount : 0;
        return {
            from: from ? from.toISOString() : null,
            to: to ? to.toISOString() : null,
            kpis: {
                invoiceCount,
                openInvoiceCount,
                customerCount,
                openCustomerCount: openCustomers.size,
                totalInvoicesKd: totalInvoices.toFixed(4),
                totalDebtKd: totalDebt.toFixed(4),
                totalPaidKd: totalPaid.toFixed(4),
                openDebtKd: openDebt.toFixed(4),
                avgDebtPerInvoiceKd: avgDebtPerInvoice.toFixed(4),
            },
            rows: finalRows,
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
            this.prisma.debtLedgerEntry.groupBy({
                by: ['orderId'],
                where: {
                    source: client_1.DebtSource.PAYMENT,
                    orderId: { in: orders.map((o) => o.orderId) },
                },
                _sum: { amount: true },
            }),
            this.prisma.debtLedgerEntry.groupBy({
                by: ['customerId', 'source'],
                where: { customerId: { in: customerIds } },
                _sum: { amount: true },
            }),
        ]);
        const paidByOrder = new Map();
        for (const g of paymentsByOrder) {
            if (!g.orderId)
                continue;
            paidByOrder.set(g.orderId, Number.parseFloat(g._sum.amount?.toString() ?? '0'));
        }
        const perCustomer = new Map();
        for (const g of perCustomerTotals) {
            const cur = perCustomer.get(g.customerId) ?? { debt: 0, payment: 0 };
            const v = Number.parseFloat(g._sum.amount?.toString() ?? '0');
            if (!Number.isFinite(v))
                continue;
            if (g.source === client_1.DebtSource.PAYMENT)
                cur.payment += v;
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