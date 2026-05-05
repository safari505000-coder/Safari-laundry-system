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
exports.AccountingController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const permissions_decorator_1 = require("../auth/permissions/permissions.decorator");
const permissions_enum_1 = require("../auth/permissions/permissions.enum");
const prisma_service_1 = require("../prisma/prisma.service");
const accounting_reconciliation_service_1 = require("./accounting-reconciliation.service");
const accounting_query_dto_1 = require("./dto/accounting-query.dto");
let AccountingController = class AccountingController {
    reconciliation;
    prisma;
    constructor(reconciliation, prisma) {
        this.reconciliation = reconciliation;
        this.prisma = prisma;
    }
    async clampScopeForManager(user, incoming) {
        if (user.role !== client_1.SafariRole.MANAGER) {
            return {
                scopeType: incoming.scopeType ?? accounting_query_dto_1.AccountingScopeType.ALL,
                branchId: incoming.branchId,
                driverId: incoming.driverId,
            };
        }
        if (!user.branchId) {
            throw new common_1.ForbiddenException('Manager has no branchId on JWT — cannot scope branch view.');
        }
        if (incoming.driverId) {
            const driver = await this.prisma.user.findUnique({
                where: { id: incoming.driverId },
                select: { branchId: true, safariRole: true },
            });
            if (!driver ||
                driver.safariRole !== client_1.SafariRole.DRIVER ||
                driver.branchId !== user.branchId) {
                throw new common_1.BadRequestException('driverId does not belong to your branch.');
            }
            return {
                scopeType: accounting_query_dto_1.AccountingScopeType.DRIVER,
                driverId: incoming.driverId,
            };
        }
        return {
            scopeType: accounting_query_dto_1.AccountingScopeType.BRANCH,
            branchId: user.branchId,
        };
    }
    async getReconciliation(query, user) {
        const scope = await this.clampScopeForManager(user, query);
        return this.reconciliation.computeCashReconciliation(query.date, scope);
    }
    async getTimeline(query, user) {
        const scope = await this.clampScopeForManager(user, query);
        return this.reconciliation.getCashTimeline({
            date: query.date,
            ...scope,
        });
    }
    getDiscrepancies() {
        return this.reconciliation.getDiscrepancies();
    }
};
exports.AccountingController = AccountingController;
__decorate([
    (0, common_1.Get)('reconciliation'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [accounting_query_dto_1.AccountingReconciliationQueryDto, Object]),
    __metadata("design:returntype", Promise)
], AccountingController.prototype, "getReconciliation", null);
__decorate([
    (0, common_1.Get)('timeline'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [accounting_query_dto_1.AccountingTimelineQueryDto, Object]),
    __metadata("design:returntype", Promise)
], AccountingController.prototype, "getTimeline", null);
__decorate([
    (0, common_1.Get)('discrepancies'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "getDiscrepancies", null);
exports.AccountingController = AccountingController = __decorate([
    (0, swagger_1.ApiTags)('accounting'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('accounting'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.MANAGER),
    (0, permissions_decorator_1.Permissions)(permissions_enum_1.AppPermission.VIEW_CASH),
    __metadata("design:paramtypes", [accounting_reconciliation_service_1.AccountingReconciliationService,
        prisma_service_1.PrismaService])
], AccountingController);
//# sourceMappingURL=accounting.controller.js.map