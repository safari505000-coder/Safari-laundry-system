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
    constructor(prisma, expensesService, payrollService, fixedExpenseService) {
        this.prisma = prisma;
        this.expensesService = expensesService;
        this.payrollService = payrollService;
        this.fixedExpenseService = fixedExpenseService;
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
    async dailyCashClosing(fromIso, toIso, branchId) {
        const { from, to } = this.parseRange(fromIso, toIso);
        const cashOrders = await this.prisma.order.findMany({
            where: {
                status: client_1.OrderStatus.COMPLETED,
                completedAt: { gte: from, lte: to },
                posPaymentMethod: client_1.PosPaymentMethod.CASH,
                ...this.ordersForBranch(branchId),
            },
            select: { totalPrice: true },
        });
        const grossMinor = (0, finance_money_1.sumOrderMinors)(cashOrders.map((o) => ({ totalPrice: o.totalPrice })));
        const expensesTotal = await this.expensesService.sumInRange(from, to, branchId);
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
    async netProfitExecutive(fromIso, toIso, branchId) {
        const { from, to } = this.parseRange(fromIso, toIso);
        const revenueAgg = await this.prisma.order.aggregate({
            where: {
                status: client_1.OrderStatus.COMPLETED,
                completedAt: { gte: from, lte: to },
                ...this.ordersForBranch(branchId),
            },
            _sum: { totalPrice: true },
        });
        const grossRevenueKd = revenueAgg._sum.totalPrice !== null &&
            revenueAgg._sum.totalPrice !== undefined
            ? revenueAgg._sum.totalPrice.toString()
            : '0';
        const variableSoapFuelKd = await this.expensesService.sumInRangeByCategories(from, to, [client_1.ExpenseCategory.SOAP, client_1.ExpenseCategory.FUEL], branchId);
        const miscOperationalKd = await this.expensesService.sumInRangeByCategories(from, to, [client_1.ExpenseCategory.MISC], branchId);
        const payrollPaidKd = await this.payrollService.sumPaidNetInRange(from, to, branchId);
        const fixedExpensesKd = await this.fixedExpenseService.sumAccruedInRange(from, to, branchId);
        const totalNonPayrollExpensesKd = new client_1.Prisma.Decimal(variableSoapFuelKd)
            .add(new client_1.Prisma.Decimal(miscOperationalKd))
            .add(new client_1.Prisma.Decimal(fixedExpensesKd))
            .toFixed(4);
        const netProfitKd = decSubMany(grossRevenueKd, variableSoapFuelKd, miscOperationalKd, payrollPaidKd, fixedExpensesKd);
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            branchId: branchId ?? null,
            grossRevenueKd,
            variableSoapFuelKd,
            miscOperationalKd,
            fixedExpensesKd,
            payrollPaidKd,
            totalExpensesVariableAndFixedKd: totalNonPayrollExpensesKd,
            netProfitKd,
        };
    }
};
exports.ReportsService = ReportsService;
exports.ReportsService = ReportsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        expenses_service_1.ExpensesService,
        payroll_service_1.PayrollService,
        fixed_expense_service_1.FixedExpenseService])
], ReportsService);
//# sourceMappingURL=reports.service.js.map