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
                    entryCount: 1,
                    currentCustomerDebtKd: '0',
                    isOpen: true,
                    lastEntryAt: e.createdAt.toISOString(),
                },
            });
        }
        const customerIds = Array.from(new Set(Array.from(byOrder.values()).map((x) => x.row.customerId)));
        const wallets = customerIds.length
            ? await this.prisma.customerWallet.findMany({
                where: { customerId: { in: customerIds } },
                select: { customerId: true, balance: true, debt: true },
            })
            : [];
        const walletByCustomer = new Map();
        for (const w of wallets) {
            const debt = Number.parseFloat(w.debt?.toString() ?? '0');
            const balance = Number.parseFloat(w.balance?.toString() ?? '0');
            const negBalance = balance < 0 ? -balance : 0;
            const openKd = (Number.isFinite(debt) && debt > 0 ? debt : 0) + negBalance;
            walletByCustomer.set(w.customerId, { openKd });
        }
        const finalRows = [];
        let totalDebt = 0;
        let openDebt = 0;
        let openInvoiceCount = 0;
        const openCustomers = new Set();
        for (const [, v] of byOrder) {
            v.row.debtAmountKd = v.debtSum.toFixed(4);
            const open = walletByCustomer.get(v.row.customerId)?.openKd ?? 0;
            v.row.currentCustomerDebtKd = open.toFixed(4);
            v.row.isOpen = open > 0.0001;
            totalDebt += v.debtSum;
            if (v.row.isOpen) {
                openDebt += v.debtSum;
                openInvoiceCount += 1;
                openCustomers.add(v.row.customerId);
            }
            finalRows.push(v.row);
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
                totalDebtKd: totalDebt.toFixed(4),
                openDebtKd: openDebt.toFixed(4),
                avgDebtPerInvoiceKd: avgDebtPerInvoice.toFixed(4),
            },
            rows: finalRows,
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