"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallCenterModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("../auth/auth.module");
const customer_ledger_module_1 = require("../customer-ledger/customer-ledger.module");
const customer_notifications_module_1 = require("../customer-notifications/customer-notifications.module");
const orders_module_1 = require("../orders/orders.module");
const payments_module_1 = require("../payments/payments.module");
const finance_module_1 = require("../finance/finance.module");
const prisma_module_1 = require("../prisma/prisma.module");
const call_center_controller_1 = require("./call-center.controller");
const call_center_service_1 = require("./call-center.service");
const daily_collections_reconciliation_cron_1 = require("./daily-collections-reconciliation.cron");
const public_statement_controller_1 = require("./public-statement.controller");
let CallCenterModule = class CallCenterModule {
};
exports.CallCenterModule = CallCenterModule;
exports.CallCenterModule = CallCenterModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            customer_ledger_module_1.CustomerLedgerModule,
            finance_module_1.FinanceModule,
            payments_module_1.PaymentsModule,
            orders_module_1.OrdersModule,
            customer_notifications_module_1.CustomerNotificationsModule,
        ],
        controllers: [call_center_controller_1.CallCenterController, public_statement_controller_1.PublicStatementController],
        providers: [call_center_service_1.CallCenterService, daily_collections_reconciliation_cron_1.DailyCollectionsReconciliationCronService],
    })
], CallCenterModule);
//# sourceMappingURL=call-center.module.js.map