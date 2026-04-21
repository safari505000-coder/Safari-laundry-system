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
exports.LeavesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const create_leave_dto_1 = require("./dto/create-leave.dto");
const list_leaves_query_dto_1 = require("./dto/list-leaves-query.dto");
const leaves_service_1 = require("./leaves.service");
let LeavesController = class LeavesController {
    leaves;
    constructor(leaves) {
        this.leaves = leaves;
    }
    create(dto, user) {
        return this.leaves.create(user.userId, dto);
    }
    list(q, user) {
        return this.leaves.list(user.role, user.userId, q);
    }
    mine(user) {
        return this.leaves.listMine(user.userId);
    }
    findOne(id, user) {
        return this.leaves.findOne(user.role, user.userId, id);
    }
    approve(id, user) {
        return this.leaves.approve(user.role, user.userId, id);
    }
    reject(id, dto, user) {
        return this.leaves.reject(user.role, user.userId, id, dto.reason);
    }
    cancel(id, user) {
        return this.leaves.cancel(user.userId, id);
    }
};
exports.LeavesController = LeavesController;
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.DRIVER, client_1.SafariRole.CALL_CENTER, client_1.SafariRole.CALL_CENTER_SUPERVISOR, client_1.SafariRole.SUPERVISOR, client_1.SafariRole.VIEWER),
    (0, swagger_1.ApiOperation)({ summary: `Submit a leave request (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_leave_dto_1.CreateLeaveDto, Object]),
    __metadata("design:returntype", void 0)
], LeavesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({ summary: `List leave requests (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [list_leaves_query_dto_1.ListLeavesQueryDto, Object]),
    __metadata("design:returntype", void 0)
], LeavesController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('mine'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.DRIVER, client_1.SafariRole.CALL_CENTER, client_1.SafariRole.CALL_CENTER_SUPERVISOR, client_1.SafariRole.SUPERVISOR, client_1.SafariRole.VIEWER),
    (0, swagger_1.ApiOperation)({ summary: `My leave requests (${branding_1.APP_BRAND})` }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], LeavesController.prototype, "mine", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.DRIVER, client_1.SafariRole.CALL_CENTER, client_1.SafariRole.CALL_CENTER_SUPERVISOR, client_1.SafariRole.SUPERVISOR, client_1.SafariRole.VIEWER),
    (0, swagger_1.ApiOperation)({ summary: `Fetch single leave row (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], LeavesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id/approve'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({ summary: `Approve a leave request (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], LeavesController.prototype, "approve", null);
__decorate([
    (0, common_1.Patch)(':id/reject'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({ summary: `Reject a leave request (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_leave_dto_1.RejectLeaveDto, Object]),
    __metadata("design:returntype", void 0)
], LeavesController.prototype, "reject", null);
__decorate([
    (0, common_1.Patch)(':id/cancel'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.DRIVER, client_1.SafariRole.CALL_CENTER, client_1.SafariRole.CALL_CENTER_SUPERVISOR, client_1.SafariRole.SUPERVISOR, client_1.SafariRole.VIEWER),
    (0, swagger_1.ApiOperation)({ summary: `Cancel own pending leave request (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], LeavesController.prototype, "cancel", null);
exports.LeavesController = LeavesController = __decorate([
    (0, swagger_1.ApiTags)('leaves'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('leaves'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [leaves_service_1.LeavesService])
], LeavesController);
//# sourceMappingURL=leaves.controller.js.map