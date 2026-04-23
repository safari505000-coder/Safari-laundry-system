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
exports.InsightsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const insights_query_dto_1 = require("./dto/insights-query.dto");
const insights_service_1 = require("./insights.service");
const weekly_executive_report_service_1 = require("./weekly-executive-report.service");
let InsightsController = class InsightsController {
    insights;
    weekly;
    constructor(insights, weekly) {
        this.insights = insights;
        this.weekly = weekly;
    }
    async cashForecast(q) {
        const horizon = q.days ?? 30;
        const lookback = Math.max(horizon * 2, 60);
        return this.insights.cashForecast(lookback, horizon);
    }
    async anomalies(q) {
        return this.insights.detectAnomalies(q.days ?? 30, 2);
    }
    async driverScorecard(q) {
        return this.insights.driverScorecard(q.days ?? 30);
    }
    listWeekly() {
        return this.weekly.listArchive();
    }
    async regenerateWeekly() {
        const entry = await this.weekly.generateLatest();
        return entry;
    }
    async downloadWeekly(key, res) {
        const { stream, filename } = await this.weekly.openReport(key);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return new common_1.StreamableFile(stream);
    }
};
exports.InsightsController = InsightsController;
__decorate([
    (0, common_1.Get)('cash-forecast'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({
        summary: 'Daily cash-flow forecast (revenue vs expenses)',
        description: 'Returns a day-by-day historical series and a moving-average/day-of-week forecast for the configured horizon. Amounts are KD, anchored to Asia/Kuwait calendar days.',
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [insights_query_dto_1.InsightsQueryDto]),
    __metadata("design:returntype", Promise)
], InsightsController.prototype, "cashForecast", null);
__decorate([
    (0, common_1.Get)('anomalies'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({
        summary: 'Detect abnormal daily revenue / expense days (Z-score)',
        description: 'Flags revenue and expense buckets outside ±2σ of the configured window. Useful for early-warning alerts on the owner control panel.',
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [insights_query_dto_1.InsightsQueryDto]),
    __metadata("design:returntype", Promise)
], InsightsController.prototype, "anomalies", null);
__decorate([
    (0, common_1.Get)('driver-scorecard'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: 'Driver performance leaderboard (composite 0-100 score)',
        description: 'Combines completed trips (40%), revenue per trip (30%), and inverted average turnaround hours (30%) into a single 0-100 score.',
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [insights_query_dto_1.InsightsQueryDto]),
    __metadata("design:returntype", Promise)
], InsightsController.prototype, "driverScorecard", null);
__decorate([
    (0, common_1.Get)('executive/weekly'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: 'List archived weekly executive reports',
        description: 'Returns the reverse-chronological catalog of generated weekly PDFs (ISO-week key + size + generation timestamp).',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], InsightsController.prototype, "listWeekly", null);
__decorate([
    (0, common_1.Post)('executive/weekly/regenerate'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: 'Regenerate the latest weekly executive PDF on demand',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], InsightsController.prototype, "regenerateWeekly", null);
__decorate([
    (0, common_1.Get)('executive/weekly/:key'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: 'Download an archived weekly executive PDF',
        description: "Key format is `YYYY-W##` (e.g. `2026-W16`). The special key `latest` returns the most recent report, regenerating it if missing.",
    }),
    __param(0, (0, common_1.Param)('key')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], InsightsController.prototype, "downloadWeekly", null);
exports.InsightsController = InsightsController = __decorate([
    (0, swagger_1.ApiTags)('insights'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('insights'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [insights_service_1.InsightsService,
        weekly_executive_report_service_1.WeeklyExecutiveReportService])
], InsightsController);
//# sourceMappingURL=insights.controller.js.map