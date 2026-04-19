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
var UsersController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const permissions_service_1 = require("../permissions/permissions.service");
const create_user_dto_1 = require("./dto/create-user.dto");
const update_user_dto_1 = require("./dto/update-user.dto");
const users_service_1 = require("./users.service");
let UsersController = UsersController_1 = class UsersController {
    usersService;
    permissionsService;
    logger = new common_1.Logger(UsersController_1.name);
    constructor(usersService, permissionsService) {
        this.usersService = usersService;
        this.permissionsService = permissionsService;
    }
    async assertCanManageStaff(user) {
        if (user.role === client_1.SafariRole.OWNER ||
            user.role === client_1.SafariRole.GENERAL_MANAGER) {
            return;
        }
        const ok = await this.permissionsService.canManageStaff(user.role);
        if (!ok) {
            throw new common_1.ForbiddenException('Missing can_manage_staff capability');
        }
    }
    requestId(req) {
        if (typeof req.requestId === 'string' && req.requestId.length > 0) {
            return req.requestId;
        }
        const h = req.headers ?? {};
        const x = (typeof h['x-request-id'] === 'string' && h['x-request-id']) ||
            (Array.isArray(h['x-request-id']) && String(h['x-request-id'][0])) ||
            req.id ||
            'n/a';
        return x;
    }
    async create(dto, user, req) {
        await this.assertCanManageStaff(user);
        const row = await this.usersService.create(dto);
        this.logger.log(JSON.stringify({
            event: 'staff.create',
            requestId: this.requestId(req),
            actorUserId: user.userId,
            actorRole: user.role,
            targetUserId: row.id,
            targetRole: row.safariRole,
        }));
        return row;
    }
    async findAll(user) {
        await this.assertCanManageStaff(user);
        return this.usersService.findAll();
    }
    async findOne(id, user) {
        await this.assertCanManageStaff(user);
        return this.usersService.findOne(id);
    }
    async update(id, dto, user, req) {
        await this.assertCanManageStaff(user);
        const row = await this.usersService.update(id, dto);
        this.logger.log(JSON.stringify({
            event: 'staff.update',
            requestId: this.requestId(req),
            actorUserId: user.userId,
            actorRole: user.role,
            targetUserId: row.id,
            targetRole: row.safariRole,
        }));
        return row;
    }
    async remove(id, user, req) {
        await this.assertCanManageStaff(user);
        const row = await this.usersService.remove(id);
        this.logger.log(JSON.stringify({
            event: 'staff.delete',
            requestId: this.requestId(req),
            actorUserId: user.userId,
            actorRole: user.role,
            targetUserId: id,
        }));
        return row;
    }
};
exports.UsersController = UsersController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({
        summary: `Create corporate user (${branding_1.APP_BRAND})`,
        description: 'Registers a staff member with institutional RBAC: OWNER (full system access), MANAGER (operational access), DRIVER (service delivery access), CALL_CENTER. Requires full name, unique username (login), password, and role.',
    }),
    (0, swagger_1.ApiBody)({ type: create_user_dto_1.CreateUserDto }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_user_dto_1.CreateUserDto, Object, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: `List users (${branding_1.APP_BRAND})` }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: `Get user by id (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiOperation)({ summary: `Update user (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_user_dto_1.UpdateUserDto, Object, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: `Delete user (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "remove", null);
exports.UsersController = UsersController = UsersController_1 = __decorate([
    (0, swagger_1.ApiTags)('users'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('users'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        permissions_service_1.PermissionsService])
], UsersController);
//# sourceMappingURL=users.controller.js.map