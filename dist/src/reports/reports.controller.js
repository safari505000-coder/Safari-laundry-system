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
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const driver_ledger_query_dto_1 = require("./dto/driver-ledger-query.dto");
const live_feed_query_dto_1 = require("./dto/live-feed-query.dto");
const reports_range_query_dto_1 = require("./dto/reports-range-query.dto");
const reports_service_1 = require("./reports.service");
let ReportsController = class ReportsController {
    reportsService;
    constructor(reportsService) {
        this.reportsService = reportsService;
    }
    managerSummary() {
        return {
            title: 'Management operations summary',
            period: new Date().toISOString().slice(0, 10),
            branchesActive: 0,
            note: 'Use issued-invoices, driver-ledger, and daily-cash-closing for operational reporting.',
        };
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
        return this.reportsService.dailyCashClosing(q.from, q.to, q.branchId);
    }
    executiveSummary(q) {
        return this.reportsService.netProfitExecutive(q.from, q.to, q.branchId);
    }
};
exports.ReportsController = ReportsController;
__decorate([
    (0, common_1.Get)('manager-summary'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.MANAGER, client_1.SafariRole.SUPERVISOR, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.VIEWER),
    (0, swagger_1.ApiOperation)({
        summary: `Management report summary (${branding_1.APP_BRAND})`,
        description: 'Lightweight heartbeat for dashboards.',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "managerSummary", null);
__decorate([
    (0, common_1.Get)('issued-invoices'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.SUPERVISOR, client_1.SafariRole.VIEWER),
    (0, swagger_1.ApiOperation)({
        summary: `Issued invoices — orders created in period (${branding_1.APP_BRAND})`,
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
        description: 'OWNER only. Last N orders by createdAt (all branches). Lightweight vs issued-invoices report.',
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [live_feed_query_dto_1.LiveFeedQueryDto]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "liveFeed", null);
__decorate([
    (0, common_1.Get)('driver-ledger'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.SUPERVISOR, client_1.SafariRole.VIEWER),
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
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.SUPERVISOR),
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
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.SUPERVISOR, client_1.SafariRole.VIEWER),
    (0, swagger_1.ApiOperation)({
        summary: `Net profit & executive KPIs (${branding_1.APP_BRAND})`,
        description: 'Gross completed sales minus SOAP/FUEL/MISC variable expenses, paid payroll, and accrued fixed schedules.',
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [reports_range_query_dto_1.ReportsRangeQueryDto]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "executiveSummary", null);
exports.ReportsController = ReportsController = __decorate([
    (0, swagger_1.ApiTags)('reports'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('reports'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [reports_service_1.ReportsService])
], ReportsController);
//# sourceMappingURL=reports.controller.js.map