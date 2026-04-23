"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommissionsModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("../auth/auth.module");
const payment_method_fees_module_1 = require("../payment-method-fees/payment-method-fees.module");
const prisma_module_1 = require("../prisma/prisma.module");
const system_settings_module_1 = require("../system-settings/system-settings.module");
const commission_earning_cron_1 = require("./commission-earning.cron");
const commission_earning_service_1 = require("./commission-earning.service");
const commission_payouts_controller_1 = require("./commission-payouts.controller");
const commission_payouts_service_1 = require("./commission-payouts.service");
const commission_rules_controller_1 = require("./commission-rules.controller");
const commission_rules_service_1 = require("./commission-rules.service");
let CommissionsModule = class CommissionsModule {
};
exports.CommissionsModule = CommissionsModule;
exports.CommissionsModule = CommissionsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            system_settings_module_1.SystemSettingsModule,
            payment_method_fees_module_1.PaymentMethodFeesModule,
        ],
        controllers: [commission_rules_controller_1.CommissionRulesController, commission_payouts_controller_1.CommissionPayoutsController],
        providers: [
            commission_rules_service_1.CommissionRulesService,
            commission_earning_service_1.CommissionEarningService,
            commission_payouts_service_1.CommissionPayoutsService,
            commission_earning_cron_1.CommissionEarningCron,
        ],
        exports: [commission_earning_service_1.CommissionEarningService, commission_payouts_service_1.CommissionPayoutsService],
    })
], CommissionsModule);
//# sourceMappingURL=commissions.module.js.map