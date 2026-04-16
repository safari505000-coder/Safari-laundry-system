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
const cash_service_1 = require("./services/cash.service");
const debt_service_1 = require("./services/debt.service");
const online_payment_service_1 = require("./services/online-payment.service");
const subscription_service_1 = require("./services/subscription.service");
let FinanceService = class FinanceService {
    cashService;
    debtService;
    onlinePaymentService;
    subscriptionService;
    constructor(cashService, debtService, onlinePaymentService, subscriptionService) {
        this.cashService = cashService;
        this.debtService = debtService;
        this.onlinePaymentService = onlinePaymentService;
        this.subscriptionService = subscriptionService;
    }
    async ensureOpenShiftForDriver(driverId) {
        return this.cashService.ensureOpenShiftForDriver(driverId);
    }
    async getDailyPosSalesByPaymentMethod(fromIso, toIso) {
        return this.cashService.getDailyPosSalesByPaymentMethod(fromIso, toIso);
    }
    async getOwnerCustomerWalletSummary() {
        return this.debtService.getOwnerCustomerWalletSummary();
    }
    async getDebtBreakdownByCategory(fromIso, toIso, category, branchId, actorUserId) {
        return this.debtService.getDebtBreakdownByCategory(fromIso, toIso, category, branchId, actorUserId);
    }
    async getDriverBalances() {
        return this.cashService.getDriverBalances();
    }
    async getDriverMonitoring() {
        return this.cashService.getDriverMonitoring();
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
    __metadata("design:paramtypes", [cash_service_1.CashService,
        debt_service_1.DebtService,
        online_payment_service_1.OnlinePaymentService,
        subscription_service_1.SubscriptionService])
], FinanceService);
//# sourceMappingURL=finance.service.js.map