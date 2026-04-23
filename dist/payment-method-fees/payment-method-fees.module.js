"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentMethodFeesModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("../auth/auth.module");
const prisma_module_1 = require("../prisma/prisma.module");
const payment_method_fees_controller_1 = require("./payment-method-fees.controller");
const payment_method_fees_service_1 = require("./payment-method-fees.service");
let PaymentMethodFeesModule = class PaymentMethodFeesModule {
};
exports.PaymentMethodFeesModule = PaymentMethodFeesModule;
exports.PaymentMethodFeesModule = PaymentMethodFeesModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, auth_module_1.AuthModule],
        controllers: [payment_method_fees_controller_1.PaymentMethodFeesController],
        providers: [payment_method_fees_service_1.PaymentMethodFeesService],
        exports: [payment_method_fees_service_1.PaymentMethodFeesService],
    })
], PaymentMethodFeesModule);
//# sourceMappingURL=payment-method-fees.module.js.map