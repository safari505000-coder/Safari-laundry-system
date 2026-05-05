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
exports.CashIntelligenceController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const permissions_decorator_1 = require("../auth/permissions/permissions.decorator");
const permissions_enum_1 = require("../auth/permissions/permissions.enum");
const cash_intelligence_v2_service_1 = require("./cash-intelligence-v2.service");
const cash_intelligence_query_dto_1 = require("./dto/cash-intelligence-query.dto");
const cash_intelligence_analysis_dto_1 = require("./dto/cash-intelligence-analysis.dto");
let CashIntelligenceController = class CashIntelligenceController {
    v2Service;
    constructor(v2Service) {
        this.v2Service = v2Service;
    }
    async getAnalysis(query, user) {
        const branchId = this.clampBranchScope(user, query.branchId);
        return this.v2Service.runAnalysis({ date: query.date, branchId });
    }
    clampBranchScope(user, requested) {
        if (user.role !== client_1.SafariRole.MANAGER)
            return requested;
        if (!user.branchId) {
            throw new common_1.ForbiddenException('Manager has no branchId on JWT — cannot scope cash intelligence view.');
        }
        if (requested && requested !== user.branchId) {
            throw new common_1.BadRequestException('branchId does not match your assigned branch.');
        }
        return user.branchId;
    }
};
exports.CashIntelligenceController = CashIntelligenceController;
__decorate([
    (0, common_1.Get)('analysis'),
    (0, swagger_1.ApiOkResponse)({ type: cash_intelligence_analysis_dto_1.CashIntelligenceAnalysisDto }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [cash_intelligence_query_dto_1.CashIntelligenceQueryDto, Object]),
    __metadata("design:returntype", Promise)
], CashIntelligenceController.prototype, "getAnalysis", null);
exports.CashIntelligenceController = CashIntelligenceController = __decorate([
    (0, swagger_1.ApiTags)('cash-intelligence'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('cash-intelligence'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.MANAGER),
    (0, permissions_decorator_1.Permissions)(permissions_enum_1.AppPermission.VIEW_CASH),
    __metadata("design:paramtypes", [cash_intelligence_v2_service_1.CashIntelligenceV2Service])
], CashIntelligenceController);
//# sourceMappingURL=cash-intelligence.controller.js.map