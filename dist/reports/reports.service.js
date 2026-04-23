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
exports.ReportsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const expenses_service_1 = require("../expenses/expenses.service");
const fixed_expense_service_1 = require("../fixed-expenses/fixed-expense.service");
const payment_method_fees_service_1 = require("../payment-method-fees/payment-method-fees.service");
const bank_fee_util_1 = require("../payment-method-fees/bank-fee.util");
const payroll_service_1 = require("../payroll/payroll.service");
const finance_money_1 = require("../finance/finance-money");
function decSubMany(base, ...subs) {
    let x = new client_1.Prisma.Decimal(base);
    for (const s of subs) {
        x = x.sub(new client_1.Prisma.Decimal(s));
    }
    return x.toFixed(4);
}
let ReportsService = class ReportsService {
    prisma;
    expensesService;
    payrollService;
    fixedExpenseService;
    paymentMethodFeesService;
    constructor(prisma, expensesService, payrollService, fixedExpenseService, paymentMethodFeesService) {
        this.prisma = prisma;
        this.expensesService = expensesService;
        this.payrollService = payrollService;
        this.fixedExpenseService = fixedExpenseService;
        this.paymentMethodFeesService = paymentMethodFeesService;
    }
    parseRange(fromIso, toIso) {
        const from = new Date(fromIso);
        const to = new Date(toIso);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
            throw new common_1.BadRequestException('Invalid date range');
        }
        return { from, to };
    }
    ordersForBranch(branchId) {
        if (!branchId)
            return {};
        return { driver: { branchId } };
    }
    async getSubscriptionSubsidyInRange(from, to, branchId) {
        const rows = await this.prisma.transactionHistory.findMany({
            where: {
                type: client_1.LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
                createdAt: { gte: from, lte: to },
            },
            select: { metadata: true },
        });
        let sum = new client_1.Prisma.Decimal(0);
        for (const row of rows) {
            const meta = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
                ? row.metadata
                : null;
            if (!meta)
                continue;
            const attributedBranchId = typeof meta.subsidyBranchId === 'string' ? meta.subsidyBranchId : null;
            if (branchId && attributedBranchId !== branchId)
                continue;
            const subsidy = typeof meta.subsidy === 'string' || typeof meta.subsidy === 'number'
                ? new client_1.Prisma.Decimal(String(meta.subsidy))
                : new client_1.Prisma.Decimal(0);
            if (subsidy.gt(0)) {
                sum = sum.add(subsidy);
            }
        }
        return sum.toFixed(4);
    }
    async issuedInvoices(fromIso, toIso, driverId, posPaymentMethod, branchId) {
        const { from, to } = this.parseRange(fromIso, toIso);
        const rows = await this.prisma.order.findMany({
            where: {
                createdAt: { gte: from, lte: to },
                ...(driverId ? { driverId } : {}),
                ...(posPaymentMethod ? { posPaymentMethod } : {}),
                ...this.ordersForBranch(branchId),
            },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                status: true,
                serviceType: true,
                totalPrice: true,
                cashStatus: true,
                invoiceNumber: true,
                posPaymentMethod: true,
                completedAt: true,
                createdAt: true,
                customer: {
                    select: { id: true, phone: true, displayName: true },
                },
                driver: {
                    select: {
                        id: true,
                        username: true,
                        fullName: true,
                        employeeId: true,
                        branchId: true,
                    },
                },
            },
        });
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            count: rows.length,
            rows: rows.map((r) => ({
                ...r,
                totalPrice: r.totalPrice.toString(),
            })),
        };
    }
    async liveFeedRecent(limit = 10) {
        const take = Math.min(Math.max(limit, 1), 25);
        const rows = await this.prisma.order.findMany({
            take,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                invoiceNumber: true,
                createdAt: true,
                totalPrice: true,
                customer: {
                    select: { displayName: true, phone: true },
                },
                driver: {
                    select: {
                        branch: { select: { id: true, name: true } },
                    },
                },
                lineItems: {
                    select: {
                        label: true,
                        quantity: true,
                        unitPrice: true,
                    },
                    orderBy: { createdAt: 'asc' },
                    take: 32,
                },
            },
        });
        return {
            orders: rows.map((o) => ({
                id: o.id,
                invoiceNumber: o.invoiceNumber,
                createdAt: o.createdAt.toISOString(),
                totalPrice: o.totalPrice.toString(),
                customerName: o.customer.displayName?.trim() || o.customer.phone || '—',
                branchName: o.driver?.branch?.name ?? null,
                branchId: o.driver?.branch?.id ?? null,
                lineItemCount: o.lineItems.length,
                lines: o.lineItems.map((li) => ({
                    label: li.label,
                    quantity: li.quantity.toString(),
                    unitPrice: li.unitPrice.toString(),
                })),
            })),
        };
    }
    async driverLedger(driverId, fromIso, toIso, branchId) {
        const { from, to } = this.parseRange(fromIso, toIso);
        const driver = await this.prisma.user.findUnique({
            where: { id: driverId },
            select: {
                id: true,
                username: true,
                fullName: true,
                employeeId: true,
                phone: true,
                safariRole: true,
                branchId: true,
            },
        });
        if (!driver || driver.safariRole !== client_1.SafariRole.DRIVER) {
            throw new common_1.BadRequestException('Invalid driver');
        }
        if (branchId && driver.branchId !== branchId) {
            throw new common_1.BadRequestException('Driver does not belong to selected branch');
        }
        const pendingCashOrders = await this.prisma.order.findMany({
            where: {
                driverId,
                status: client_1.OrderStatus.COMPLETED,
                cashStatus: client_1.CashStatus.PAID_TO_DRIVER,
                posPaymentMethod: client_1.PosPaymentMethod.CASH,
            },
            select: { id: true, totalPrice: true, invoiceNumber: true, createdAt: true },
        });
        const heldMinor = (0, finance_money_1.sumOrderMinors)(pendingCashOrders.map((o) => ({ totalPrice: o.totalPrice })));
        const ordersInPeriod = await this.prisma.order.findMany({
            where: {
                driverId,
                createdAt: { gte: from, lte: to },
            },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                status: true,
                totalPrice: true,
                cashStatus: true,
                posPaymentMethod: true,
                invoiceNumber: true,
                completedAt: true,
                createdAt: true,
            },
        });
        return {
            driver,
            owedToOfficeKd: (0, finance_money_1.minorToAmountString)(heldMinor),
            pendingSettlementOrderCount: pendingCashOrders.length,
            period: { from: from.toISOString(), to: to.toISOString() },
            ordersInPeriod: ordersInPeriod.map((o) => ({
                ...o,
                totalPrice: o.totalPrice.toString(),
            })),
        };
    }
    async dailyCashClosing(fromIso, toIso, branchId, driverId) {
        const { from, to } = this.parseRange(fromIso, toIso);
        const cashOrders = await this.prisma.order.findMany({
            where: {
                status: client_1.OrderStatus.COMPLETED,
                completedAt: { gte: from, lte: to },
                posPaymentMethod: client_1.PosPaymentMethod.CASH,
                ...this.ordersForBranch(branchId),
                ...(driverId ? { driverId } : {}),
            },
            select: { totalPrice: true },
        });
        const grossMinor = (0, finance_money_1.sumOrderMinors)(cashOrders.map((o) => ({ totalPrice: o.totalPrice })));
        const expensesTotal = await this.expensesService.sumInRange(from, to, branchId, driverId);
        const expensesMinor = BigInt(Math.round(Number.parseFloat(expensesTotal) * 10_000));
        const netMinor = grossMinor - expensesMinor;
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            grossCashSalesKd: (0, finance_money_1.minorToAmountString)(grossMinor),
            expensesTotalKd: expensesTotal,
            netCashAfterExpensesKd: (0, finance_money_1.minorToAmountString)(netMinor),
            cashOrderCount: cashOrders.length,
        };
    }
    async aggregateBankFeesForCompletedOrders(from, to, branchId, driverId) {
        const config = await this.paymentMethodFeesService.getConfig();
        const orders = await this.prisma.order.findMany({
            where: {
                status: client_1.OrderStatus.COMPLETED,
                completedAt: { gte: from, lte: to },
                ...this.ordersForBranch(branchId),
                ...(driverId ? { driverId } : {}),
            },
            select: {
                totalPrice: true,
                posPaymentMethod: true,
                driver: { select: { branchId: true } },
            },
        });
        const byBranch = new Map();
        let totalFees = new client_1.Prisma.Decimal(0);
        let grossAll = new client_1.Prisma.Decimal(0);
        for (const o of orders) {
            const gross = new client_1.Prisma.Decimal(o.totalPrice.toString());
            grossAll = grossAll.add(gross);
            const fee = (0, bank_fee_util_1.computeOrderBankFeeKd)(gross, o.posPaymentMethod, config);
            totalFees = totalFees.add(fee);
            const bid = o.driver?.branchId ?? null;
            const prev = byBranch.get(bid) ?? new client_1.Prisma.Decimal(0);
            byBranch.set(bid, prev.add(fee));
        }
        const settled = grossAll.sub(totalFees);
        const branchRows = [...byBranch.entries()].map(([id, v]) => ({
            branchId: id,
            bankFeesKd: v.toFixed(4),
        }));
        branchRows.sort((a, b) => (a.branchId ?? '').localeCompare(b.branchId ?? ''));
        return {
            totalBankFeesKd: totalFees.toFixed(4),
            settledRevenueAfterBankFeesKd: settled.toFixed(4),
            byBranch: branchRows,
        };
    }
    async netProfitExecutive(fromIso, toIso, branchId, driverId) {
        const { from, to } = this.parseRange(fromIso, toIso);
        const revenueAgg = await this.prisma.order.aggregate({
            where: {
                status: client_1.OrderStatus.COMPLETED,
                completedAt: { gte: from, lte: to },
                ...this.ordersForBranch(branchId),
                ...(driverId ? { driverId } : {}),
            },
            _sum: { totalPrice: true },
        });
        const grossRevenueKd = revenueAgg._sum.totalPrice !== null &&
            revenueAgg._sum.totalPrice !== undefined
            ? revenueAgg._sum.totalPrice.toString()
            : '0';
        const bankAgg = await this.aggregateBankFeesForCompletedOrders(from, to, branchId, driverId);
        const bankFeesTotalKd = bankAgg.totalBankFeesKd;
        const settledRevenueAfterBankFeesKd = bankAgg.settledRevenueAfterBankFeesKd;
        const variableSoapFuelKd = await this.expensesService.sumInRangeByCategories(from, to, [client_1.ExpenseCategory.SOAP, client_1.ExpenseCategory.FUEL], branchId, driverId);
        const miscOperationalKd = await this.expensesService.sumInRangeByCategories(from, to, [client_1.ExpenseCategory.MISC], branchId, driverId);
        const payrollPaidKd = driverId
            ? '0.0000'
            : await this.payrollService.sumPaidNetInRange(from, to, branchId);
        const fixedExpensesKd = driverId
            ? '0.0000'
            : await this.fixedExpenseService.sumAccruedInRange(from, to, branchId);
        const subscriptionSubsidyKd = driverId
            ? '0.0000'
            : await this.getSubscriptionSubsidyInRange(from, to, branchId);
        const enterpriseSubscriptionSubsidyKd = driverId
            ? '0.0000'
            : await this.getSubscriptionSubsidyInRange(from, to);
        const totalNonPayrollExpensesKd = new client_1.Prisma.Decimal(variableSoapFuelKd)
            .add(new client_1.Prisma.Decimal(miscOperationalKd))
            .add(new client_1.Prisma.Decimal(fixedExpensesKd))
            .toFixed(4);
        const netProfitKd = driverId
            ? decSubMany(grossRevenueKd, bankFeesTotalKd, variableSoapFuelKd, miscOperationalKd)
            : decSubMany(grossRevenueKd, bankFeesTotalKd, variableSoapFuelKd, miscOperationalKd, payrollPaidKd, fixedExpensesKd);
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            branchId: branchId ?? null,
            driverId: driverId ?? null,
            grossRevenueKd,
            bankFeesTotalKd,
            settledRevenueAfterBankFeesKd,
            variableSoapFuelKd,
            miscOperationalKd,
            fixedExpensesKd,
            subscriptionSubsidyKd,
            enterpriseSubscriptionSubsidyKd,
            payrollPaidKd,
            totalExpensesVariableAndFixedKd: totalNonPayrollExpensesKd,
            netProfitKd,
        };
    }
    async computeCollectionsForRange(from, to, branchId) {
        const rows = await this.prisma.order.findMany({
            where: {
                status: client_1.OrderStatus.COMPLETED,
                completedAt: { gte: from, lte: to },
                ...this.ordersForBranch(branchId),
            },
            select: { totalPrice: true, cashStatus: true },
        });
        let collected = new client_1.Prisma.Decimal(0);
        let uncollected = new client_1.Prisma.Decimal(0);
        for (const o of rows) {
            const amount = new client_1.Prisma.Decimal(o.totalPrice.toString());
            if (o.cashStatus === client_1.CashStatus.UNPAID) {
                uncollected = uncollected.add(amount);
            }
            else {
                collected = collected.add(amount);
            }
        }
        return {
            collectedRevenueKd: collected.toFixed(4),
            uncollectedRevenueKd: uncollected.toFixed(4),
        };
    }
    async computeDebtPaymentsInRange(from, to, branchId) {
        const payments = await this.prisma.debtLedgerEntry.findMany({
            where: {
                source: client_1.DebtSource.PAYMENT,
                createdAt: { gte: from, lte: to },
                orderId: { not: null },
                ...(branchId ? { branchId } : {}),
            },
            select: {
                amount: true,
                orderId: true,
                order: { select: { completedAt: true } },
            },
        });
        let sum = new client_1.Prisma.Decimal(0);
        for (const p of payments) {
            if (!p.orderId)
                continue;
            const completedAt = p.order?.completedAt;
            if (completedAt && completedAt < from) {
                sum = sum.add(new client_1.Prisma.Decimal(p.amount.toString()));
            }
        }
        return sum.toFixed(4);
    }
    async computeOutstandingDebtBreakdown(branchId) {
        const rows = await this.prisma.debtLedgerEntry.groupBy({
            by: ['customerId', 'source'],
            where: branchId ? { branchId } : {},
            _sum: { amount: true },
        });
        const z = new client_1.Prisma.Decimal(0);
        const byCustomer = new Map();
        for (const r of rows) {
            const amt = new client_1.Prisma.Decimal(r._sum.amount?.toString() ?? '0');
            const cur = byCustomer.get(r.customerId) ?? {
                inv: new client_1.Prisma.Decimal(0),
                sub: new client_1.Prisma.Decimal(0),
                pay: new client_1.Prisma.Decimal(0),
            };
            if (r.source === client_1.DebtSource.INVOICE_SHORTFALL)
                cur.inv = cur.inv.add(amt);
            else if (r.source === client_1.DebtSource.SUBSCRIPTION_OVERUSE)
                cur.sub = cur.sub.add(amt);
            else if (r.source === client_1.DebtSource.PAYMENT)
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
        const total = openInv.add(openSub);
        return {
            outstandingInvoiceDebtKd: openInv.toFixed(4),
            outstandingSubscriptionDebtKd: openSub.toFixed(4),
            outstandingDebtKd: total.toFixed(4),
        };
    }
    async monthlySummary(fromIso, toIso) {
        const { from, to } = this.parseRange(fromIso, toIso);
        const [consolidated, branches, consolidatedCollections, consolidatedDebtPayments, consolidatedDebtOpen, inventoryConsumption,] = await Promise.all([
            this.netProfitExecutive(fromIso, toIso),
            this.prisma.branch.findMany({
                where: { isActive: true },
                orderBy: { name: 'asc' },
                select: { id: true, name: true },
            }),
            this.computeCollectionsForRange(from, to),
            this.computeDebtPaymentsInRange(from, to),
            this.computeOutstandingDebtBreakdown(),
            this.computeMonthlyInventoryConsumption(from, to),
        ]);
        const netWithSubsidy = (base, subsidy) => {
            const n = Number.parseFloat(base || '0') - Number.parseFloat(subsidy || '0');
            if (!Number.isFinite(n))
                return base;
            return n.toFixed(4);
        };
        const perBranch = await Promise.all(branches.map(async (b) => {
            const [row, coll, debtPayments, open] = await Promise.all([
                this.netProfitExecutive(fromIso, toIso, b.id),
                this.computeCollectionsForRange(from, to, b.id),
                this.computeDebtPaymentsInRange(from, to, b.id),
                this.computeOutstandingDebtBreakdown(b.id),
            ]);
            return {
                branchId: b.id,
                branchName: b.name,
                grossRevenueKd: row.grossRevenueKd,
                bankFeesTotalKd: row.bankFeesTotalKd,
                settledRevenueAfterBankFeesKd: row.settledRevenueAfterBankFeesKd,
                variableSoapFuelKd: row.variableSoapFuelKd,
                miscOperationalKd: row.miscOperationalKd,
                fixedExpensesKd: row.fixedExpensesKd,
                payrollPaidKd: row.payrollPaidKd,
                totalExpensesVariableAndFixedKd: row.totalExpensesVariableAndFixedKd,
                subscriptionSubsidyKd: row.subscriptionSubsidyKd,
                netProfitKd: netWithSubsidy(row.netProfitKd, row.subscriptionSubsidyKd),
                collectedRevenueKd: coll.collectedRevenueKd,
                uncollectedRevenueKd: coll.uncollectedRevenueKd,
                debtPaymentsReceivedKd: debtPayments,
                outstandingInvoiceDebtKd: open.outstandingInvoiceDebtKd,
                outstandingSubscriptionDebtKd: open.outstandingSubscriptionDebtKd,
                outstandingDebtKd: open.outstandingDebtKd,
            };
        }));
        return {
            from: consolidated.from,
            to: consolidated.to,
            consolidated: {
                grossRevenueKd: consolidated.grossRevenueKd,
                bankFeesTotalKd: consolidated.bankFeesTotalKd,
                settledRevenueAfterBankFeesKd: consolidated.settledRevenueAfterBankFeesKd,
                variableSoapFuelKd: consolidated.variableSoapFuelKd,
                miscOperationalKd: consolidated.miscOperationalKd,
                fixedExpensesKd: consolidated.fixedExpensesKd,
                payrollPaidKd: consolidated.payrollPaidKd,
                totalExpensesVariableAndFixedKd: consolidated.totalExpensesVariableAndFixedKd,
                subscriptionSubsidyKd: consolidated.subscriptionSubsidyKd,
                netProfitKd: netWithSubsidy(consolidated.netProfitKd, consolidated.subscriptionSubsidyKd),
                collectedRevenueKd: consolidatedCollections.collectedRevenueKd,
                uncollectedRevenueKd: consolidatedCollections.uncollectedRevenueKd,
                debtPaymentsReceivedKd: consolidatedDebtPayments,
                outstandingInvoiceDebtKd: consolidatedDebtOpen.outstandingInvoiceDebtKd,
                outstandingSubscriptionDebtKd: consolidatedDebtOpen.outstandingSubscriptionDebtKd,
                outstandingDebtKd: consolidatedDebtOpen.outstandingDebtKd,
            },
            branches: perBranch,
            inventoryConsumption,
        };
    }
    async computeMonthlyInventoryConsumption(from, to) {
        const groups = await this.prisma.stockMovement.groupBy({
            by: ['branchId', 'stockItemId'],
            where: {
                type: client_1.StockMovementType.STOCK_OUT,
                createdAt: { gte: from, lte: to },
            },
            _sum: { quantity: true },
            _count: true,
        });
        if (!groups.length) {
            return { branches: [] };
        }
        const branchIds = [...new Set(groups.map((g) => g.branchId))];
        const stockItemIds = [...new Set(groups.map((g) => g.stockItemId))];
        const [branchRows, items] = await Promise.all([
            this.prisma.branch.findMany({
                where: { id: { in: branchIds } },
                select: { id: true, name: true },
            }),
            this.prisma.stockItem.findMany({
                where: { id: { in: stockItemIds } },
                select: { id: true, code: true, nameAr: true, unit: true },
            }),
        ]);
        const branchNameById = new Map(branchRows.map((b) => [b.id, b.name]));
        const itemById = new Map(items.map((i) => [i.id, i]));
        const linesByBranch = new Map();
        for (const g of groups) {
            const item = itemById.get(g.stockItemId);
            if (!item)
                continue;
            const sumQty = g._sum.quantity;
            const quantityConsumed = sumQty
                ? new client_1.Prisma.Decimal(sumQty).neg().toFixed(4)
                : '0.0000';
            const rawCount = g._count;
            const movementCount = typeof rawCount === 'number' ? rawCount : (rawCount._all ?? 0);
            const line = {
                stockItemId: g.stockItemId,
                code: item.code,
                nameAr: item.nameAr,
                unit: item.unit,
                quantityConsumed,
                movementCount,
            };
            const list = linesByBranch.get(g.branchId) ?? [];
            list.push(line);
            linesByBranch.set(g.branchId, list);
        }
        const branches = branchIds
            .map((branchId) => ({
            branchId,
            branchName: branchNameById.get(branchId) ?? branchId,
            lines: (linesByBranch.get(branchId) ?? []).sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar')),
        }))
            .filter((b) => b.lines.length > 0)
            .sort((a, b) => a.branchName.localeCompare(b.branchName, 'ar'));
        return { branches };
    }
    async bankFeesByBranch(fromIso, toIso) {
        const { from, to } = this.parseRange(fromIso, toIso);
        const agg = await this.aggregateBankFeesForCompletedOrders(from, to);
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            totalBankFeesKd: agg.totalBankFeesKd,
            branches: agg.byBranch,
        };
    }
    async unifiedLedgerStream(fromIso, toIso, driverId, branchId) {
        const { from, to } = this.parseRange(fromIso, toIso);
        const glWhere = {
            createdAt: { gte: from, lte: to },
            entryType: {
                in: [
                    client_1.GeneralLedgerEntryType.POS_SALE_COMPLETED,
                    client_1.GeneralLedgerEntryType.EXPENSE_RECORDED,
                    client_1.GeneralLedgerEntryType.WALLET_SETTLEMENT,
                    client_1.GeneralLedgerEntryType.DEBT_ADJUSTMENT,
                ],
            },
        };
        if (driverId) {
            const [driverOrderIds, driverExpenseIds] = await Promise.all([
                this.prisma.order.findMany({
                    where: { driverId },
                    select: { id: true },
                }),
                this.prisma.branchExpense.findMany({
                    where: { recordedById: driverId },
                    select: { id: true },
                }),
            ]);
            const oids = driverOrderIds.map((o) => o.id);
            const eids = driverExpenseIds.map((e) => e.id);
            glWhere.OR = [
                { actorUserId: driverId },
                ...(oids.length ? [{ orderId: { in: oids } }] : []),
                ...(eids.length ? [{ expenseId: { in: eids } }] : []),
            ];
        }
        const glRows = await this.prisma.generalLedgerEntry.findMany({
            where: glWhere,
            orderBy: { createdAt: 'desc' },
            take: 800,
        });
        const orderIds = [
            ...new Set(glRows.map((r) => r.orderId).filter((x) => !!x)),
        ];
        const expenseIds = [
            ...new Set(glRows.map((r) => r.expenseId).filter((x) => !!x)),
        ];
        let orders = [];
        let expenses = [];
        if (orderIds.length) {
            orders = await this.prisma.order.findMany({
                where: {
                    id: { in: orderIds },
                    ...this.ordersForBranch(branchId),
                },
                select: {
                    id: true,
                    driverId: true,
                    posPaymentMethod: true,
                    invoiceNumber: true,
                    driver: { select: { id: true, fullName: true, branchId: true } },
                },
            });
        }
        if (expenseIds.length) {
            expenses = await this.prisma.branchExpense.findMany({
                where: {
                    id: { in: expenseIds },
                    ...this.branchWhere(branchId),
                },
                select: {
                    id: true,
                    title: true,
                    category: true,
                    receiptUrl: true,
                    recordedById: true,
                    recordedBy: { select: { fullName: true } },
                },
            });
        }
        const orderMap = new Map(orders.map((o) => [o.id, o]));
        const expenseMap = new Map(expenses.map((e) => [e.id, e]));
        const out = [];
        const saleType = (m) => {
            if (m === null || m === undefined)
                return 'OTHER_SALE';
            if (m === client_1.PosPaymentMethod.CASH)
                return 'CASH_SALE';
            if (m === client_1.PosPaymentMethod.KNET)
                return 'KNET_SALE';
            if (m === client_1.PosPaymentMethod.PAYMENT_LINK || m === client_1.PosPaymentMethod.ONLINE)
                return 'ONLINE_SALE';
            if (m === client_1.PosPaymentMethod.DEBT_ON_ACCOUNT)
                return 'DEBT_SALE';
            if (m === client_1.PosPaymentMethod.SUBSCRIPTION_WALLET)
                return 'WALLET_SALE';
            return 'OTHER_SALE';
        };
        for (const row of glRows) {
            if (row.entryType === client_1.GeneralLedgerEntryType.POS_SALE_COMPLETED && row.orderId) {
                const ord = orderMap.get(row.orderId);
                if (!ord)
                    continue;
                if (branchId && ord.driver?.branchId !== branchId)
                    continue;
                const meta = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
                    ? row.metadata
                    : {};
                const pm = meta.posPaymentMethod;
                const method = pm ?? ord.posPaymentMethod;
                out.push({
                    id: row.id,
                    at: row.createdAt.toISOString(),
                    streamType: saleType(method),
                    amountKd: row.amount.toString(),
                    memo: row.memo,
                    driverId: ord.driverId,
                    driverName: ord.driver?.fullName ?? null,
                    attachmentUrl: null,
                    refKind: 'ORDER',
                    refId: ord.id,
                });
            }
            else if (row.entryType === client_1.GeneralLedgerEntryType.EXPENSE_RECORDED &&
                row.expenseId) {
                const exp = expenseMap.get(row.expenseId);
                if (!exp)
                    continue;
                const streamType = exp.category === client_1.ExpenseCategory.FUEL ? 'FUEL_EXPENSE' : 'OTHER_EXPENSE';
                const attach = typeof exp.receiptUrl === 'string' && exp.receiptUrl.trim().length > 0 ?
                    exp.receiptUrl.trim()
                    : null;
                out.push({
                    id: row.id,
                    at: row.createdAt.toISOString(),
                    streamType,
                    amountKd: row.amount.toString(),
                    memo: exp.title,
                    driverId: exp.recordedById,
                    driverName: exp.recordedBy?.fullName ?? null,
                    attachmentUrl: attach,
                    refKind: 'EXPENSE',
                    refId: exp.id,
                });
            }
            else if (row.entryType === client_1.GeneralLedgerEntryType.WALLET_SETTLEMENT) {
                out.push({
                    id: row.id,
                    at: row.createdAt.toISOString(),
                    streamType: 'CUSTODY_VERIFIED',
                    amountKd: row.amount.toString(),
                    memo: row.memo,
                    driverId: null,
                    driverName: null,
                    attachmentUrl: null,
                    refKind: 'GL',
                    refId: row.id,
                });
            }
            else if (row.entryType === client_1.GeneralLedgerEntryType.DEBT_ADJUSTMENT) {
                const ordRef = row.orderId && orderMap.has(row.orderId) ? orderMap.get(row.orderId) : null;
                if (branchId && ordRef && ordRef.driver?.branchId !== branchId)
                    continue;
                out.push({
                    id: row.id,
                    at: row.createdAt.toISOString(),
                    streamType: 'DEBT_ADJUSTMENT',
                    amountKd: row.amount.toString(),
                    memo: row.memo,
                    driverId: ordRef?.driverId ?? null,
                    driverName: ordRef?.driver?.fullName ?? null,
                    attachmentUrl: null,
                    refKind: ordRef ? 'ORDER' : 'GL',
                    refId: ordRef?.id ?? row.id,
                });
            }
        }
        const depositWhere = {
            createdAt: { gte: from, lte: to },
            ...(driverId ? { driverId } : {}),
            ...(branchId ?
                { driver: { branchId } }
                : {}),
        };
        const deposits = await this.prisma.deposit.findMany({
            where: depositWhere,
            orderBy: { createdAt: 'desc' },
            take: 400,
            select: {
                id: true,
                amount: true,
                createdAt: true,
                receiptImage: true,
                driverId: true,
                driver: { select: { fullName: true } },
            },
        });
        for (const d of deposits) {
            out.push({
                id: `dep-${d.id}`,
                at: d.createdAt.toISOString(),
                streamType: 'DEPOSIT',
                amountKd: d.amount.toString(),
                memo: 'Driver deposit',
                driverId: d.driverId,
                driverName: d.driver.fullName,
                attachmentUrl: d.receiptImage,
                refKind: 'DEPOSIT',
                refId: d.id,
            });
        }
        out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            rows: out,
        };
    }
    branchWhere(branchId) {
        if (!branchId)
            return {};
        return { branchId };
    }
};
exports.ReportsService = ReportsService;
exports.ReportsService = ReportsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        expenses_service_1.ExpensesService,
        payroll_service_1.PayrollService,
        fixed_expense_service_1.FixedExpenseService,
        payment_method_fees_service_1.PaymentMethodFeesService])
], ReportsService);
//# sourceMappingURL=reports.service.js.map