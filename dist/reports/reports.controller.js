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
exports.ReportsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const permissions_decorator_1 = require("../auth/permissions/permissions.decorator");
const permissions_enum_1 = require("../auth/permissions/permissions.enum");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const audit_service_1 = require("../common/audit/audit.service");
const branding_1 = require("../common/constants/branding");
const driver_ledger_query_dto_1 = require("./dto/driver-ledger-query.dto");
const live_feed_query_dto_1 = require("./dto/live-feed-query.dto");
const reports_range_query_dto_1 = require("./dto/reports-range-query.dto");
const reports_service_1 = require("./reports.service");
let ReportsController = class ReportsController {
    reportsService;
    audit;
    constructor(reportsService, audit) {
        this.reportsService = reportsService;
        this.audit = audit;
    }
    issuedInvoices(q) {
        return this.reportsService.issuedInvoices(q.from, q.to, q.driverId, q.posPaymentMethod, q.branchId);
    }
    liveFeed(q) {
        return this.reportsService.liveFeedRecent(q.limit ?? 10);
    }
    driverLedger(q) {
        return this.reportsService.driverLedger(q.driverId, q.from, q.to, q.branchId);
    }
    dailyCashClosing(q) {
        return this.reportsService.dailyCashClosing(q.from, q.to, q.branchId, q.driverId);
    }
    executiveSummary(q) {
        return this.reportsService.netProfitExecutive(q.from, q.to, q.branchId, q.driverId);
    }
    monthlySummary(q) {
        return this.reportsService.monthlySummary(q.from, q.to);
    }
    moneyFlowStatement(q, user) {
        this.audit.logAudit('FINANCIAL_REPORT_ACCESS', user, {
            report: 'money-flow-statement',
            from: q.from,
            to: q.to,
        });
        return this.reportsService.moneyFlowStatement(q.from, q.to);
    }
    bankFeesByBranch(q) {
        return this.reportsService.bankFeesByBranch(q.from, q.to);
    }
    unifiedLedgerStream(q) {
        return this.reportsService.unifiedLedgerStream(q.from, q.to, q.driverId, q.branchId);
    }
};
exports.ReportsController = ReportsController;
__decorate([
    (0, common_1.Get)('issued-invoices'),
    (0, permissions_decorator_1.Permissions)(permissions_enum_1.AppPermission.VIEW_INVOICES, permissions_enum_1.AppPermission.VIEW_REPORTS),
    (0, swagger_1.ApiOperation)({
        summary: `Issued invoices — orders created in period (${branding_1.APP_BRAND})`,
        description: 'A3.D6 — Time axis is Order.createdAt (invoice-issuance time). Includes canceled rows so the count ties to the serial counter. For a "completed in range" view use /reports/completed-orders which filters on Order.completedAt instead (the axis the Executive P&L uses).',
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [reports_range_query_dto_1.ReportsRangeQueryDto]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "issuedInvoices", null);
__decorate([
    (0, common_1.Get)('live-feed'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER),
    (0, swagger_1.ApiOperation)({
        summary: `Recent invoices — live operations feed (${branding_1.APP_BRAND})`,
        description: 'OWNER only. Safari Pulse feed (last N orders by createdAt, all branches). Locked to OWNER at the API layer regardless of UI route guards.',
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [live_feed_query_dto_1.LiveFeedQueryDto]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "liveFeed", null);
__decorate([
    (0, common_1.Get)('driver-ledger'),
    (0, permissions_decorator_1.Permissions)(permissions_enum_1.AppPermission.VIEW_CASH, permissions_enum_1.AppPermission.VIEW_REPORTS),
    (0, swagger_1.ApiOperation)({
        summary: `Driver cash vs office — held COD and period activity (${branding_1.APP_BRAND})`,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [driver_ledger_query_dto_1.DriverLedgerQueryDto]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "driverLedger", null);
__decorate([
    (0, common_1.Get)('daily-cash-closing'),
    (0, permissions_decorator_1.Permissions)(permissions_enum_1.AppPermission.VIEW_CASH, permissions_enum_1.AppPermission.VIEW_REPORTS),
    (0, swagger_1.ApiOperation)({
        summary: `Daily cash closing — gross CASH sales minus expenses (${branding_1.APP_BRAND})`,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [reports_range_query_dto_1.ReportsRangeQueryDto]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "dailyCashClosing", null);
__decorate([
    (0, common_1.Get)('executive-summary'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Net profit & executive KPIs (${branding_1.APP_BRAND})`,
        description: 'Gross completed sales minus bank fees (non-cash rails), SOAP/FUEL/MISC variable expenses, paid payroll, and accrued fixed schedules. Invoice totals unchanged.',
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [reports_range_query_dto_1.ReportsRangeQueryDto]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "executiveSummary", null);
__decorate([
    (0, common_1.Get)('monthly-summary'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Monthly summary — consolidated P&L + per-branch rows (${branding_1.APP_BRAND})`,
        description: 'V19.13 — Single endpoint feeding the "الملخص الشهري" screen. Returns one consolidated block (all branches) and an array with the same metrics scoped to every active branch. OWNER + GENERAL_MANAGER only — executive oversight, not an accountant tool. Shares the same math as /reports/executive-summary so reconciliation is guaranteed.',
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [reports_range_query_dto_1.ReportsRangeQueryDto]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "monthlySummary", null);
__decorate([
    (0, common_1.Get)('money-flow-statement'),
    (0, permissions_decorator_1.Permissions)(permissions_enum_1.AppPermission.VIEW_FINANCIAL_REPORTS),
    (0, swagger_1.ApiOperation)({
        summary: `Money flow statement — income, deductions, expenses, ledger rollups (${branding_1.APP_BRAND})`,
        description: 'V19.24 — Consolidated executive lines (same as /reports/executive-summary), approved branch/vehicle expenses, accrued fixed costs by category, collections split, prior-period invoice debt payments, plus GL / wallet / debt ledger rollups for the window.',
    }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [reports_range_query_dto_1.ReportsRangeQueryDto, Object]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "moneyFlowStatement", null);
__decorate([
    (0, common_1.Get)('bank-fees-by-branch'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Bank fees by branch — completed sales (${branding_1.APP_BRAND})`,
        description: 'V8.5 reporting-layer allocation of KNET/card fees per driver branch.',
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [reports_range_query_dto_1.ReportsRangeQueryDto]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "bankFeesByBranch", null);
__decorate([
    (0, common_1.Get)('unified-ledger-stream'),
    (0, permissions_decorator_1.Permissions)(permissions_enum_1.AppPermission.VIEW_FINANCIAL_REPORTS),
    (0, swagger_1.ApiOperation)({
        summary: `Unified ledger stream (${branding_1.APP_BRAND})`,
        description: 'POS ledger entries, driver field expenses (with receipt pointers), and driver deposits for accountant radar. GENERAL_MANAGER included to match `unifiedLedger.view` in the access matrix and exports.',
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [reports_range_query_dto_1.ReportsRangeQueryDto]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "unifiedLedgerStream", null);
exports.ReportsController = ReportsController = __decorate([
    (0, swagger_1.ApiTags)('reports'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('reports'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [reports_service_1.ReportsService,
        audit_service_1.AuditService])
], ReportsController);
//# sourceMappingURL=reports.controller.js.map