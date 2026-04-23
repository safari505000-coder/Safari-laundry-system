"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebtHoldsModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("../auth/auth.module");
const prisma_module_1 = require("../prisma/prisma.module");
const system_settings_module_1 = require("../system-settings/system-settings.module");
const debt_holds_controller_1 = require("./debt-holds.controller");
const debt_holds_service_1 = require("./debt-holds.service");
let DebtHoldsModule = class DebtHoldsModule {
};
exports.DebtHoldsModule = DebtHoldsModule;
exports.DebtHoldsModule = DebtHoldsModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, auth_module_1.AuthModule, system_settings_module_1.SystemSettingsModule],
        controllers: [debt_holds_controller_1.DebtHoldsController],
        providers: [debt_holds_service_1.DebtHoldsService],
        exports: [debt_holds_service_1.DebtHoldsService],
    })
], DebtHoldsModule);
//# sourceMappingURL=debt-holds.module.js.map