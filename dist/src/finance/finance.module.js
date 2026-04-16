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
const payments_module_1 = require("../payments/payments.module");
const prisma_module_1 = require("../prisma/prisma.module");
const bank_deposits_controller_1 = require("./bank-deposits.controller");
const bank_deposits_service_1 = require("./bank-deposits.service");
const finance_controller_1 = require("./finance.controller");
const finance_service_1 = require("./finance.service");
const cash_service_1 = require("./services/cash.service");
const debt_service_1 = require("./services/debt.service");
const online_payment_service_1 = require("./services/online-payment.service");
const subscription_service_1 = require("./services/subscription.service");
let FinanceModule = class FinanceModule {
};
exports.FinanceModule = FinanceModule;
exports.FinanceModule = FinanceModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, payments_module_1.PaymentsModule],
        controllers: [finance_controller_1.FinanceController, bank_deposits_controller_1.BankDepositsController],
        providers: [
            finance_service_1.FinanceService,
            bank_deposits_service_1.BankDepositsService,
            cash_service_1.CashService,
            online_payment_service_1.OnlinePaymentService,
            debt_service_1.DebtService,
            subscription_service_1.SubscriptionService,
        ],
        exports: [finance_service_1.FinanceService, bank_deposits_service_1.BankDepositsService],
    })
], FinanceModule);
//# sourceMappingURL=finance.module.js.map