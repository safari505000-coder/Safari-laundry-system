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
exports.LoansController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const create_loan_dto_1 = require("./dto/create-loan.dto");
const list_loans_query_dto_1 = require("./dto/list-loans-query.dto");
const loans_service_1 = require("./loans.service");
let LoansController = class LoansController {
    loans;
    constructor(loans) {
        this.loans = loans;
    }
    create(dto, user) {
        return this.loans.create(user.role, user.userId, dto);
    }
    list(q, user) {
        return this.loans.list(user.role, user.userId, q);
    }
    mine(user) {
        return this.loans.listMine(user.userId);
    }
    findOne(id, user) {
        return this.loans.findOne(user.role, user.userId, id);
    }
    approve(id, user) {
        return this.loans.approve(user.role, user.userId, id);
    }
    reject(id, dto, user) {
        return this.loans.reject(user.role, user.userId, id, dto.reason);
    }
};
exports.LoansController = LoansController;
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.DRIVER, client_1.SafariRole.CALL_CENTER, client_1.SafariRole.SUPERVISOR, client_1.SafariRole.VIEWER),
    (0, swagger_1.ApiOperation)({ summary: `Create loan request (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_loan_dto_1.CreateLoanDto, Object]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({ summary: `List loans (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [list_loans_query_dto_1.ListLoansQueryDto, Object]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('mine'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.DRIVER, client_1.SafariRole.CALL_CENTER, client_1.SafariRole.SUPERVISOR, client_1.SafariRole.VIEWER),
    (0, swagger_1.ApiOperation)({ summary: `My loans (${branding_1.APP_BRAND})` }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "mine", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.DRIVER, client_1.SafariRole.CALL_CENTER, client_1.SafariRole.SUPERVISOR, client_1.SafariRole.VIEWER),
    (0, swagger_1.ApiOperation)({ summary: `Fetch single loan row (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id/approve'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({ summary: `Approve loan (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "approve", null);
__decorate([
    (0, common_1.Patch)(':id/reject'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({ summary: `Reject loan (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_loan_dto_1.RejectLoanDto, Object]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "reject", null);
exports.LoansController = LoansController = __decorate([
    (0, swagger_1.ApiTags)('loans'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('loans'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [loans_service_1.LoansService])
], LoansController);
//# sourceMappingURL=loans.controller.js.map