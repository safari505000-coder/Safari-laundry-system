"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportsModule = void 0;
const common_1 = require("@nestjs/common");
const attendance_module_1 = require("../attendance/attendance.module");
const auth_module_1 = require("../auth/auth.module");
const finance_module_1 = require("../finance/finance.module");
const inventory_module_1 = require("../inventory/inventory.module");
const payroll_module_1 = require("../payroll/payroll.module");
const prisma_module_1 = require("../prisma/prisma.module");
const reports_module_1 = require("../reports/reports.module");
const exports_controller_1 = require("./exports.controller");
const exports_service_1 = require("./exports.service");
let ExportsModule = class ExportsModule {
};
exports.ExportsModule = ExportsModule;
exports.ExportsModule = ExportsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            reports_module_1.ReportsModule,
            attendance_module_1.AttendanceModule,
            payroll_module_1.PayrollModule,
            finance_module_1.FinanceModule,
            inventory_module_1.InventoryModule,
        ],
        controllers: [exports_controller_1.ExportsController],
        providers: [exports_service_1.ExportsService],
        exports: [exports_service_1.ExportsService],
    })
], ExportsModule);
//# sourceMappingURL=exports.module.js.map