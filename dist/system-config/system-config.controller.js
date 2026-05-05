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
exports.SystemConfigController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const system_config_dto_1 = require("./dto/system-config.dto");
const system_config_service_1 = require("./system-config.service");
let SystemConfigController = class SystemConfigController {
    service;
    constructor(service) {
        this.service = service;
    }
    async read(user) {
        this.assertOwner(user);
        return this.service.getPublicConfig();
    }
    async update(dto, user) {
        this.assertOwner(user);
        const incoming = dto.guardianPhone === undefined ? null : dto.guardianPhone;
        await this.service.setGuardianPhone(incoming);
        return this.service.getPublicConfig();
    }
    assertOwner(user) {
        if (user.role !== client_1.SafariRole.OWNER) {
            throw new common_1.ForbiddenException('System config is restricted to OWNER.');
        }
    }
};
exports.SystemConfigController = SystemConfigController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Read SystemConfig (Owner only).' }),
    (0, swagger_1.ApiOkResponse)({ type: system_config_dto_1.SystemConfigResponseDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SystemConfigController.prototype, "read", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Update SystemConfig (Owner only). Validates Kuwait phone format; pass null/empty to clear.',
    }),
    (0, swagger_1.ApiOkResponse)({ type: system_config_dto_1.SystemConfigResponseDto }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [system_config_dto_1.UpdateSystemConfigDto, Object]),
    __metadata("design:returntype", Promise)
], SystemConfigController.prototype, "update", null);
exports.SystemConfigController = SystemConfigController = __decorate([
    (0, swagger_1.ApiTags)('system-config'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('system-config'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER),
    __metadata("design:paramtypes", [system_config_service_1.SystemConfigService])
], SystemConfigController);
//# sourceMappingURL=system-config.controller.js.map