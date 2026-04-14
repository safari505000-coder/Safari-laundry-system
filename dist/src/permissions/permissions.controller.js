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
exports.PermissionsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const branding_1 = require("../common/constants/branding");
const permission_key_dto_1 = require("./dto/permission-key.dto");
const permissions_service_1 = require("./permissions.service");
let PermissionsController = class PermissionsController {
    permissionsService;
    constructor(permissionsService) {
        this.permissionsService = permissionsService;
    }
    list() {
        return this.permissionsService.listPermissions();
    }
    getRole(roleId) {
        return this.permissionsService.getRoleWithPermissions(roleId);
    }
    grant(roleId, dto) {
        return this.permissionsService.grantToRole(roleId, dto);
    }
    revoke(roleId, dto) {
        return this.permissionsService.revokeFromRole(roleId, dto);
    }
};
exports.PermissionsController = PermissionsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: `List all permission keys (${branding_1.APP_BRAND})` }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PermissionsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('roles/:roleId'),
    (0, swagger_1.ApiOperation)({ summary: `Get role and its permissions (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Param)('roleId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PermissionsController.prototype, "getRole", null);
__decorate([
    (0, common_1.Post)('roles/:roleId/grant'),
    (0, swagger_1.ApiOperation)({ summary: `Grant a permission to a role (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Param)('roleId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, permission_key_dto_1.PermissionKeyDto]),
    __metadata("design:returntype", void 0)
], PermissionsController.prototype, "grant", null);
__decorate([
    (0, common_1.Post)('roles/:roleId/revoke'),
    (0, swagger_1.ApiOperation)({ summary: `Revoke a permission from a role (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Param)('roleId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, permission_key_dto_1.PermissionKeyDto]),
    __metadata("design:returntype", void 0)
], PermissionsController.prototype, "revoke", null);
exports.PermissionsController = PermissionsController = __decorate([
    (0, swagger_1.ApiTags)('permissions'),
    (0, common_1.Controller)('permissions'),
    __metadata("design:paramtypes", [permissions_service_1.PermissionsService])
], PermissionsController);
//# sourceMappingURL=permissions.controller.js.map