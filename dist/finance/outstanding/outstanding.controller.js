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
exports.OutstandingController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../../auth/guards/roles.guard");
const outstanding_export_service_1 = require("./outstanding-export.service");
const outstanding_query_dto_1 = require("./dto/outstanding-query.dto");
const update_customer_collection_status_dto_1 = require("./dto/update-customer-collection-status.dto");
const outstanding_service_1 = require("./outstanding.service");
const READ_ROLES = [
    client_1.SafariRole.OWNER,
    client_1.SafariRole.GENERAL_MANAGER,
    client_1.SafariRole.ACCOUNTANT,
    client_1.SafariRole.CALL_CENTER,
    client_1.SafariRole.CALL_CENTER_SUPERVISOR,
];
const MUTATE_ROLES = [
    client_1.SafariRole.CALL_CENTER,
    client_1.SafariRole.CALL_CENTER_SUPERVISOR,
    client_1.SafariRole.OWNER,
];
let OutstandingController = class OutstandingController {
    outstanding;
    exporter;
    constructor(outstanding, exporter) {
        this.outstanding = outstanding;
        this.exporter = exporter;
    }
    list(query, user) {
        return this.outstanding.listOutstanding(query, user);
    }
    async export(body, query, user, res) {
        const merged = { ...query, ...body };
        const { stream, filename } = await this.exporter.toXlsx(merged, user);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return new common_1.StreamableFile(stream);
    }
    getStatus(customerId) {
        return this.outstanding.getCollectionStatus(customerId);
    }
    async patchStatus(customerId, body, user) {
        if (!user) {
            throw new common_1.ForbiddenException('CUSTOMER_COLLECTION_STATUS_FORBIDDEN');
        }
        return this.outstanding.updateCollectionStatus({
            customerId,
            body,
            actorUserId: user.userId ?? null,
            actorRole: user.role ?? null,
        });
    }
};
exports.OutstandingController = OutstandingController;
__decorate([
    (0, common_1.Get)('finance/outstanding'),
    (0, roles_decorator_1.Roles)(...READ_ROLES),
    (0, swagger_1.ApiOperation)({
        summary: 'List outstanding customers',
        description: 'Aggregates Collections-scope receivable orders per customer (same predicate as the red «market debt» KPI: UNPAID + open FIFO debt-on-account, excluding canceled). Headline totalDueKd matches that KPI when no narrowing filters are set. Optional `from`/`to` bound Order.createdAt.',
    }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [outstanding_query_dto_1.OutstandingQueryDto, Object]),
    __metadata("design:returntype", Promise)
], OutstandingController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('finance/outstanding/export'),
    (0, roles_decorator_1.Roles)(...READ_ROLES),
    (0, swagger_1.ApiOperation)({
        summary: 'Export the current outstanding view as Excel',
        description: 'Mirrors the same filters as `GET /api/finance/outstanding` and streams an xlsx workbook back. Body and query are merged so the front-end can call POST with a JSON snapshot of the filter bar.',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [outstanding_query_dto_1.OutstandingQueryDto,
        outstanding_query_dto_1.OutstandingQueryDto, Object, Object]),
    __metadata("design:returntype", Promise)
], OutstandingController.prototype, "export", null);
__decorate([
    (0, common_1.Get)('finance/customer/:id/status'),
    (0, roles_decorator_1.Roles)(...READ_ROLES),
    (0, swagger_1.ApiOperation)({ summary: 'Read the AR collection status row for a customer' }),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], OutstandingController.prototype, "getStatus", null);
__decorate([
    (0, common_1.Patch)('finance/customer/:id/status'),
    (0, roles_decorator_1.Roles)(...MUTATE_ROLES),
    (0, swagger_1.ApiOperation)({
        summary: 'Update collection status / manual block toggle',
        description: 'Manual operator action. Writes a `CUSTOMER_COLLECTION_UPDATED` audit row and (when applicable) a paired CUSTOMER_BLOCKED / CUSTOMER_UNBLOCKED financial event. Never invoked from automation.',
    }),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_customer_collection_status_dto_1.UpdateCustomerCollectionStatusDto, Object]),
    __metadata("design:returntype", Promise)
], OutstandingController.prototype, "patchStatus", null);
exports.OutstandingController = OutstandingController = __decorate([
    (0, swagger_1.ApiTags)('finance.outstanding'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [outstanding_service_1.OutstandingService,
        outstanding_export_service_1.OutstandingExportService])
], OutstandingController);
//# sourceMappingURL=outstanding.controller.js.map