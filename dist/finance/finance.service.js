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
exports.FinanceService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const cash_service_1 = require("./services/cash.service");
const debt_service_1 = require("./services/debt.service");
const online_payment_service_1 = require("./services/online-payment.service");
const subscription_service_1 = require("./services/subscription.service");
let FinanceService = class FinanceService {
    prisma;
    cashService;
    debtService;
    onlinePaymentService;
    subscriptionService;
    constructor(prisma, cashService, debtService, onlinePaymentService, subscriptionService) {
        this.prisma = prisma;
        this.cashService = cashService;
        this.debtService = debtService;
        this.onlinePaymentService = onlinePaymentService;
        this.subscriptionService = subscriptionService;
    }
    async ensureOpenShiftForDriver(driverId) {
        return this.cashService.ensureOpenShiftForDriver(driverId);
    }
    async getDailyPosSalesByPaymentMethod(fromIso, toIso, scopedDriverId) {
        return this.cashService.getDailyPosSalesByPaymentMethod(fromIso, toIso, scopedDriverId);
    }
    async getOwnerCustomerWalletSummary() {
        return this.debtService.getOwnerCustomerWalletSummary();
    }
    async getDebtBreakdownByCategory(fromIso, toIso, category, branchId, actorUserId) {
        return this.debtService.getDebtBreakdownByCategory(fromIso, toIso, category, branchId, actorUserId);
    }
    async getOpenDebtByIssuer(branchId) {
        return this.debtService.getOpenDebtByIssuer(branchId);
    }
    async getDriverBalances() {
        return this.cashService.getDriverBalances();
    }
    async getDriverMonitoring(branchId = null) {
        return this.cashService.getDriverMonitoring(branchId);
    }
    async updateDriverTracking(driverId, dto) {
        return this.cashService.updateDriverTracking(driverId, dto);
    }
    async confirmHandover(managerId, dto) {
        return this.cashService.confirmHandover(managerId, dto);
    }
    async getOwnerFinancialCycleReport() {
        return this.cashService.getOwnerFinancialCycleReport();
    }
    async getDriverCashTrace(query) {
        return this.cashService.getDriverCashTrace(query);
    }
    async getUnpaidInvoices(query) {
        return this.debtService.getUnpaidInvoices(query);
    }
    async getConsolidatedCashSnapshot() {
        const [driverCashKd, custodyAgg, walletAgg, unverifiedAgg, distinctDriversHoldingCash,] = await Promise.all([
            this.cashService.getTotalCashWithDrivers(),
            this.prisma.managerCashCustody.aggregate({
                where: {
                    status: {
                        in: [
                            client_1.ManagerCashCustodyStatus.PENDING_DEPOSIT,
                            client_1.ManagerCashCustodyStatus.AWAITING_VERIFICATION,
                        ],
                    },
                },
                _sum: { amountKd: true },
                _count: { _all: true },
            }),
            this.prisma.wallet.aggregate({
                where: { currency: 'KWD' },
                _sum: { balance: true },
                _count: { _all: true },
            }),
            this.prisma.bankDepositLog.aggregate({
                where: { verifiedAt: null },
                _sum: { amountKd: true },
                _count: { _all: true },
            }),
            this.prisma.order.groupBy({
                by: ['driverId'],
                where: {
                    status: 'COMPLETED',
                    cashStatus: 'PAID_TO_DRIVER',
                    posPaymentMethod: 'CASH',
                },
            }),
        ]);
        const toDec = (v) => v ? new client_1.Prisma.Decimal(v.toString()) : new client_1.Prisma.Decimal(0);
        const driverField = new client_1.Prisma.Decimal(driverCashKd);
        const custody = toDec(custodyAgg._sum.amountKd);
        const wallets = toDec(walletAgg._sum.balance);
        const unverified = toDec(unverifiedAgg._sum.amountKd);
        const total = driverField.plus(custody).plus(wallets).plus(unverified);
        return {
            atIso: new Date().toISOString(),
            driverFieldCashKd: driverField.toFixed(4),
            managerCustodyPendingKd: custody.toFixed(4),
            branchWalletsKd: wallets.toFixed(4),
            unverifiedBankDepositsKd: unverified.toFixed(4),
            totalKd: total.toFixed(4),
            breakdown: {
                driverCount: distinctDriversHoldingCash.length,
                custodyBagCount: custodyAgg._count._all,
                branchWalletCount: walletAgg._count._all,
                unverifiedBankDepositCount: unverifiedAgg._count._all,
            },
        };
    }
    async getRealtimeTotals() {
        const [cashTotal, onlineTotal, debtTotal, usage] = await Promise.all([
            this.cashService.getTotalCashWithDrivers(),
            this.onlinePaymentService.getTotalOnlineRevenue(),
            this.debtService.getTotalDebt(),
            this.subscriptionService.getUsageAndSettledDebtTotals(),
        ]);
        return {
            totalCash: cashTotal,
            totalOnline: onlineTotal,
            totalDebt: debtTotal,
            totalSubscriptionUsage: usage.totalSubscriptionUsage,
        };
    }
};
exports.FinanceService = FinanceService;
exports.FinanceService = FinanceService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        cash_service_1.CashService,
        debt_service_1.DebtService,
        online_payment_service_1.OnlinePaymentService,
        subscription_service_1.SubscriptionService])
], FinanceService);
//# sourceMappingURL=finance.service.js.map