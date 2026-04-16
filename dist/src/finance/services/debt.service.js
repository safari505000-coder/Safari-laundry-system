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
};
exports.DebtService = DebtService;
exports.DebtService = DebtService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        subscription_service_1.SubscriptionService])
], DebtService);
//# sourceMappingURL=debt.service.js.map