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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const list_attendance_query_dto_1 = require("../attendance/dto/list-attendance-query.dto");
const inventory_report_query_dto_1 = require("../inventory/dto/inventory-report-query.dto");
const list_movements_query_dto_1 = require("../inventory/dto/list-movements-query.dto");
const exports_service_1 = require("./exports.service");
let ExportsController = class ExportsController {
    exports;
    constructor(exports) {
        this.exports = exports;
    }
    async issuedInvoicesXlsx(from, to, driverId, branchId, res) {
        const { stream, filename } = await this.exports.issuedInvoicesXlsx(from, to, driverId, branchId);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return new common_1.StreamableFile(stream);
    }
    async issuedInvoicesPdf(from, to, driverId, branchId, res) {
        const { stream, filename } = await this.exports.issuedInvoicesPdf(from, to, driverId, branchId);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return new common_1.StreamableFile(stream);
    }
    async unifiedLedgerXlsx(from, to, driverId, branchId, res) {
        const { stream, filename } = await this.exports.unifiedLedgerXlsx(from, to, driverId, branchId);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return new common_1.StreamableFile(stream);
    }
    async attendanceXlsx(q, res) {
        const { stream, filename } = await this.exports.attendanceXlsx(q);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return new common_1.StreamableFile(stream);
    }
    async payrollXlsx(from, to, branchId, user, res) {
        const { stream, filename } = await this.exports.payrollXlsx(user.role, from, to, branchId);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return new common_1.StreamableFile(stream);
    }
    async inventoryReportXlsx(q, res) {
        const { stream, filename } = await this.exports.inventoryReportXlsx(q);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return new common_1.StreamableFile(stream);
    }
    async stockMovementsXlsx(q, res) {
        const { stream, filename } = await this.exports.stockMovementsXlsx(q);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return new common_1.StreamableFile(stream);
    }
    async financialCycleXlsx(date, res) {
        const { stream, filename } = await this.exports.financialCycleXlsx(date);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return new common_1.StreamableFile(stream);
    }
};
exports.ExportsController = ExportsController;
__decorate([
    (0, common_1.Get)('issued-invoices.xlsx'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: 'Export issued invoices as Excel',
        description: 'Streams an .xlsx workbook with the same filter contract as `GET /api/reports/issued-invoices`. RTL layout, brand header, grand total row.',
    }),
    __param(0, (0, common_1.Query)('from')),
    __param(1, (0, common_1.Query)('to')),
    __param(2, (0, common_1.Query)('driverId')),
    __param(3, (0, common_1.Query)('branchId')),
    __param(4, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ExportsController.prototype, "issuedInvoicesXlsx", null);
__decorate([
    (0, common_1.Get)('issued-invoices.pdf'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: 'Export issued invoices as PDF',
        description: 'Streams a one-shot PDF with the invoice list — useful for email attachments or headless cron.',
    }),
    __param(0, (0, common_1.Query)('from')),
    __param(1, (0, common_1.Query)('to')),
    __param(2, (0, common_1.Query)('driverId')),
    __param(3, (0, common_1.Query)('branchId')),
    __param(4, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ExportsController.prototype, "issuedInvoicesPdf", null);
__decorate([
    (0, common_1.Get)('unified-ledger.xlsx'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({ summary: 'Export the unified ledger stream as Excel' }),
    __param(0, (0, common_1.Query)('from')),
    __param(1, (0, common_1.Query)('to')),
    __param(2, (0, common_1.Query)('driverId')),
    __param(3, (0, common_1.Query)('branchId')),
    __param(4, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ExportsController.prototype, "unifiedLedgerXlsx", null);
__decorate([
    (0, common_1.Get)('attendance.xlsx'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({ summary: 'Export attendance log as Excel' }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [list_attendance_query_dto_1.ListAttendanceQueryDto, Object]),
    __metadata("design:returntype", Promise)
], ExportsController.prototype, "attendanceXlsx", null);
__decorate([
    (0, common_1.Get)('payroll.xlsx'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({ summary: 'Export payroll period as Excel' }),
    __param(0, (0, common_1.Query)('from')),
    __param(1, (0, common_1.Query)('to')),
    __param(2, (0, common_1.Query)('branchId')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __param(4, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ExportsController.prototype, "payrollXlsx", null);
__decorate([
    (0, common_1.Get)('inventory.xlsx'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({ summary: 'Export the smart inventory report as Excel' }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [inventory_report_query_dto_1.InventoryReportQueryDto, Object]),
    __metadata("design:returntype", Promise)
], ExportsController.prototype, "inventoryReportXlsx", null);
__decorate([
    (0, common_1.Get)('stock-movements.xlsx'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({ summary: 'Export stock movements audit as Excel' }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [list_movements_query_dto_1.ListMovementsQueryDto, Object]),
    __metadata("design:returntype", Promise)
], ExportsController.prototype, "stockMovementsXlsx", null);
__decorate([
    (0, common_1.Get)('financial-cycle.xlsx'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({ summary: 'Export the daily financial cycle as Excel' }),
    __param(0, (0, common_1.Query)('date')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ExportsController.prototype, "financialCycleXlsx", null);
exports.ExportsController = ExportsController = __decorate([
    (0, swagger_1.ApiTags)('exports'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('exports'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [exports_service_1.ExportsService])
], ExportsController);
//# sourceMappingURL=exports.controller.js.map