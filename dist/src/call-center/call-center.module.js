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
const payments_module_1 = require("../payments/payments.module");
const prisma_module_1 = require("../prisma/prisma.module");
const call_center_controller_1 = require("./call-center.controller");
const call_center_service_1 = require("./call-center.service");
let CallCenterModule = class CallCenterModule {
};
exports.CallCenterModule = CallCenterModule;
exports.CallCenterModule = CallCenterModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, auth_module_1.AuthModule, customer_ledger_module_1.CustomerLedgerModule, payments_module_1.PaymentsModule],
        controllers: [call_center_controller_1.CallCenterController],
        providers: [call_center_service_1.CallCenterService],
    })
], CallCenterModule);
//# sourceMappingURL=call-center.module.js.map