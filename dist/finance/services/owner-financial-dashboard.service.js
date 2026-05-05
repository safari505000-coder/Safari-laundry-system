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
exports.OwnerFinancialDashboardService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const customer_360_financials_1 = require("../../customers/customer-360-financials");
const prisma_service_1 = require("../../prisma/prisma.service");
const accountant_dashboard_query_dto_1 = require("../dto/accountant-dashboard-query.dto");
const accountant_dashboard_service_1 = require("./accountant-dashboard.service");
const cash_service_1 = require("./cash.service");
const customer_intelligence_service_1 = require("./customer-intelligence.service");
const driver_risk_service_1 = require("./driver-risk.service");
const finance_dashboard_cache_service_1 = require("./finance-dashboard-cache.service");
const financial_alerts_service_1 = require("./financial-alerts.service");
const CUSTOMER_LIMIT = Number.parseInt(process.env.FINANCE_OWNER_DASHBOARD_CUSTOMER_LIMIT ?? '500', 10) || 500;
let OwnerFinancialDashboardService = class OwnerFinancialDashboardService {
    prisma;
    cashService;
    accountantDashboard;
    customerIntelligence;
    driverRisk;
    alerts;
    cache;
    constructor(prisma, cashService, accountantDashboard, customerIntelligence, driverRisk, alerts, cache) {
        this.prisma = prisma;
        this.cashService = cashService;
        this.accountantDashboard = accountantDashboard;
        this.customerIntelligence = customerIntelligence;
        this.driverRisk = driverRisk;
        this.alerts = alerts;
        this.cache = cache;
    }
    getDashboard() {
        const key = this.cache.cacheKey('owner-financial-dashboard', {
            v: '1',
            limit: String(CUSTOMER_LIMIT),
        });
        return this.cache.wrapJson(key, () => this.buildDashboard());
    }
    async buildDashboard() {
        const now = new Date();
        const { cur, prev } = this.accountantDashboard.resolveWindow(accountant_dashboard_query_dto_1.AccountantDashboardPeriod.TODAY, now);
        const [totalInvoicesToday, totalPaymentsToday, customerRollup, cashInDrivers, cashInOffice, reconciliation, riskyDrivers, expenseTotals,] = await Promise.all([
            this.totalInvoices(cur.from, cur.to),
            this.totalPayments(cur.from, cur.to),
            this.customerRollup(),
            this.cashService.getTotalCashWithDrivers(),
            this.cashInOffice(),
            this.accountantDashboard.getReconciliation({
                period: accountant_dashboard_query_dto_1.AccountantDashboardPeriod.TODAY,
            }),
            this.driverRisk.getRiskyDrivers(10),
            this.alerts.expenseWindowTotals(this.prisma, cur, prev),
        ]);
        const alerts = await this.alerts.buildAlerts({
            topCustomers: customerRollup.topCustomers,
            riskyDrivers,
            reconciliationDifferenceKd: reconciliation.differenceKd,
            expenseCurrentKd: expenseTotals.currentKd,
            expensePreviousKd: expenseTotals.previousKd,
            now,
        });
        return {
            generatedAt: now.toISOString(),
            totalInvoicesToday,
            totalPaymentsToday,
            totalDueTotal: customerRollup.totalDueTotal,
            cashInDrivers,
            cashInOffice,
            reconciliationDifference: reconciliation.differenceKd,
            alerts,
            topCustomers: customerRollup.topCustomers,
            riskyDrivers,
        };
    }
    async totalInvoices(from, to) {
        const agg = await this.prisma.order.aggregate({
            where: {
                status: { not: client_1.OrderStatus.CANCELED },
                createdAt: { gte: from, lte: to },
            },
            _sum: { totalPrice: true },
        });
        return toKd(agg._sum.totalPrice);
    }
    async totalPayments(from, to) {
        const paidOrders = await this.prisma.order.findMany({
            where: {
                status: { not: client_1.OrderStatus.CANCELED },
                completedAt: { gte: from, lte: to },
                cashStatus: {
                    in: [
                        client_1.CashStatus.PAID_TO_DRIVER,
                        client_1.CashStatus.PAID_ONLINE,
                        client_1.CashStatus.HANDED_OVER_TO_OFFICE,
                    ],
                },
                posPaymentMethod: { not: client_1.PosPaymentMethod.DEBT_ON_ACCOUNT },
            },
            select: { id: true, totalPrice: true },
            take: 5000,
        });
        const paidOrderIds = paidOrders.map((order) => order.id);
        const ledgerPayments = await this.prisma.debtLedgerEntry.findMany({
            where: {
                source: client_1.DebtSource.PAYMENT,
                createdAt: { gte: from, lte: to },
                ...(paidOrderIds.length > 0 ? { orderId: { notIn: paidOrderIds } } : {}),
            },
            select: { amount: true },
            take: 5000,
        });
        const orderTotal = paidOrders.reduce((sum, order) => sum.plus(order.totalPrice), new client_1.Prisma.Decimal(0));
        const ledgerTotal = ledgerPayments.reduce((sum, row) => sum.plus(row.amount.abs()), new client_1.Prisma.Decimal(0));
        return orderTotal.plus(ledgerTotal).toFixed(4);
    }
    async cashInOffice() {
        const agg = await this.prisma.managerCashCustody.aggregate({
            where: {
                status: {
                    in: [
                        client_1.ManagerCashCustodyStatus.PENDING_DEPOSIT,
                        client_1.ManagerCashCustodyStatus.AWAITING_VERIFICATION,
                    ],
                },
            },
            _sum: { amountKd: true },
        });
        return toKd(agg._sum.amountKd);
    }
    async customerRollup() {
        const customers = await this.prisma.customer.findMany({
            where: {
                OR: [
                    { orders: { some: { status: { not: client_1.OrderStatus.CANCELED } } } },
                    { debtLedgerEntries: { some: {} } },
                ],
            },
            select: { id: true, displayName: true, phone: true },
            orderBy: { updatedAt: 'desc' },
            take: CUSTOMER_LIMIT,
        });
        const rows = [];
        let totalDue = new client_1.Prisma.Decimal(0);
        for (const customer of customers) {
            const financials = await (0, customer_360_financials_1.computeCustomer360FinancialCore)(this.prisma, customer.id);
            const due = new client_1.Prisma.Decimal(financials.totalDueKd);
            totalDue = totalDue.plus(due);
            if (due.lte(0))
                continue;
            const intelligence = await this.customerIntelligence.buildCustomerIntelligence(customer.id, financialsForEvaluator(financials));
            rows.push({
                customerId: customer.id,
                displayName: customer.displayName ?? customer.phone ?? null,
                totalDueKd: financials.totalDueKd,
                totalInvoicesKd: financials.totalInvoicesKd,
                totalPaymentsKd: financials.totalPaymentsKd,
                customerHealth: intelligence.customerHealth,
                paymentConsistency: intelligence.paymentConsistency,
                avgPaymentDelayHours: intelligence.avgPaymentDelayHours,
                lifetimeValueKd: intelligence.lifetimeValueKd,
            });
        }
        rows.sort((a, b) => Number.parseFloat(b.totalDueKd) - Number.parseFloat(a.totalDueKd) ||
            a.customerId.localeCompare(b.customerId));
        return {
            totalDueTotal: totalDue.toFixed(4),
            topCustomers: rows.slice(0, 10),
        };
    }
};
exports.OwnerFinancialDashboardService = OwnerFinancialDashboardService;
exports.OwnerFinancialDashboardService = OwnerFinancialDashboardService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        cash_service_1.CashService,
        accountant_dashboard_service_1.AccountantDashboardService,
        customer_intelligence_service_1.CustomerIntelligenceService,
        driver_risk_service_1.DriverRiskService,
        financial_alerts_service_1.FinancialAlertsService,
        finance_dashboard_cache_service_1.FinanceDashboardCacheService])
], OwnerFinancialDashboardService);
function financialsForEvaluator(financials) {
    return {
        consumedKd: financials.consumedKd,
        subscriptionValueKd: financials.subscriptionValueKd,
        subscriptionConsumedKd: financials.subscriptionConsumedKd,
        totalDueKd: financials.totalDueKd,
        isBlocked: financials.isBlocked,
    };
}
function toKd(value) {
    return value?.toFixed(4) ?? '0.0000';
}
//# sourceMappingURL=owner-financial-dashboard.service.js.map