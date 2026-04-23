"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FixedExpenseModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("../auth/auth.module");
const prisma_module_1 = require("../prisma/prisma.module");
const fixed_expense_controller_1 = require("./fixed-expense.controller");
const fixed_expense_service_1 = require("./fixed-expense.service");
let FixedExpenseModule = class FixedExpenseModule {
};
exports.FixedExpenseModule = FixedExpenseModule;
exports.FixedExpenseModule = FixedExpenseModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, auth_module_1.AuthModule],
        controllers: [fixed_expense_controller_1.FixedExpenseController],
        providers: [fixed_expense_service_1.FixedExpenseService],
        exports: [fixed_expense_service_1.FixedExpenseService],
    })
], FixedExpenseModule);
//# sourceMappingURL=fixed-expense.module.js.map