"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinanceModule = void 0;
const common_1 = require("@nestjs/common");
const general_ledger_module_1 = require("../general-ledger/general-ledger.module");
const payments_module_1 = require("../payments/payments.module");
const prisma_module_1 = require("../prisma/prisma.module");
const bank_deposits_controller_1 = require("./bank-deposits.controller");
const bank_deposits_service_1 = require("./bank-deposits.service");
const deposits_controller_1 = require("./deposits.controller");
const deposits_service_1 = require("./deposits.service");
const finance_controller_1 = require("./finance.controller");
const journal_controller_1 = require("./journal.controller");
const finance_service_1 = require("./finance.service");
const cash_service_1 = require("./services/cash.service");
const debt_service_1 = require("./services/debt.service");
const online_payment_service_1 = require("./services/online-payment.service");
const subscription_service_1 = require("./services/subscription.service");
const accountant_dashboard_service_1 = require("./services/accountant-dashboard.service");
const customer_intelligence_service_1 = require("./services/customer-intelligence.service");
const driver_risk_service_1 = require("./services/driver-risk.service");
const finance_dashboard_cache_service_1 = require("./services/finance-dashboard-cache.service");
const financial_alerts_service_1 = require("./services/financial-alerts.service");
const owner_financial_dashboard_service_1 = require("./services/owner-financial-dashboard.service");
const ledger_controller_1 = require("./ledger/ledger.controller");
const ledger_projection_service_1 = require("./ledger/ledger-projection.service");
let FinanceModule = class FinanceModule {
};
exports.FinanceModule = FinanceModule;
exports.FinanceModule = FinanceModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, payments_module_1.PaymentsModule, general_ledger_module_1.GeneralLedgerModule],
        controllers: [
            finance_controller_1.FinanceController,
            journal_controller_1.JournalController,
            bank_deposits_controller_1.BankDepositsController,
            deposits_controller_1.DepositsController,
            ledger_controller_1.LedgerController,
        ],
        providers: [
            finance_service_1.FinanceService,
            bank_deposits_service_1.BankDepositsService,
            deposits_service_1.DepositsService,
            cash_service_1.CashService,
            online_payment_service_1.OnlinePaymentService,
            debt_service_1.DebtService,
            subscription_service_1.SubscriptionService,
            finance_dashboard_cache_service_1.FinanceDashboardCacheService,
            accountant_dashboard_service_1.AccountantDashboardService,
            customer_intelligence_service_1.CustomerIntelligenceService,
            driver_risk_service_1.DriverRiskService,
            financial_alerts_service_1.FinancialAlertsService,
            owner_financial_dashboard_service_1.OwnerFinancialDashboardService,
            ledger_projection_service_1.LedgerProjectionService,
        ],
        exports: [
            finance_service_1.FinanceService,
            bank_deposits_service_1.BankDepositsService,
            deposits_service_1.DepositsService,
            cash_service_1.CashService,
            debt_service_1.DebtService,
            subscription_service_1.SubscriptionService,
            owner_financial_dashboard_service_1.OwnerFinancialDashboardService,
            ledger_projection_service_1.LedgerProjectionService,
        ],
    })
], FinanceModule);
//# sourceMappingURL=finance.module.js.map