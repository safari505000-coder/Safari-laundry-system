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
exports.SystemSettingsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const update_debt_hold_policy_dto_1 = require("./dto/update-debt-hold-policy.dto");
const update_payroll_settings_dto_1 = require("./dto/update-payroll-settings.dto");
const update_toggle_dto_1 = require("./dto/update-toggle.dto");
const system_settings_service_1 = require("./system-settings.service");
let SystemSettingsController = class SystemSettingsController {
    service;
    constructor(service) {
        this.service = service;
    }
    listToggles(user) {
        return this.service.listToggles(user.role);
    }
    setToggle(dto, user) {
        return this.service.setToggle(user.role, user.userId, dto.key, dto.isEnabled);
    }
    getPolicy() {
        return this.service.getDebtHoldPolicy();
    }
    updatePolicy(dto, user) {
        return this.service.updateDebtHoldPolicy(user.role, dto);
    }
    getPayrollSettings() {
        return this.service.getPayrollSettings();
    }
    updatePayrollSettings(dto, user) {
        return this.service.updatePayrollSettings(user.role, dto);
    }
};
exports.SystemSettingsController = SystemSettingsController;
__decorate([
    (0, common_1.Get)('toggles'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `List master subsystem toggles (${branding_1.APP_BRAND})`,
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SystemSettingsController.prototype, "listToggles", null);
__decorate([
    (0, common_1.Patch)('toggles'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({ summary: `Set a subsystem toggle (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [update_toggle_dto_1.UpdateToggleDto, Object]),
    __metadata("design:returntype", void 0)
], SystemSettingsController.prototype, "setToggle", null);
__decorate([
    (0, common_1.Get)('debt-hold-policy'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({ summary: `Fetch debt-hold policy (${branding_1.APP_BRAND})` }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SystemSettingsController.prototype, "getPolicy", null);
__decorate([
    (0, common_1.Put)('debt-hold-policy'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({ summary: `Update debt-hold policy (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [update_debt_hold_policy_dto_1.UpdateDebtHoldPolicyDto, Object]),
    __metadata("design:returntype", void 0)
], SystemSettingsController.prototype, "updatePolicy", null);
__decorate([
    (0, common_1.Get)('payroll-settings'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({
        summary: `Fetch payroll-level settings singleton (${branding_1.APP_BRAND})`,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SystemSettingsController.prototype, "getPayrollSettings", null);
__decorate([
    (0, common_1.Put)('payroll-settings'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Update payroll-level settings singleton (${branding_1.APP_BRAND})`,
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [update_payroll_settings_dto_1.UpdatePayrollSettingsDto, Object]),
    __metadata("design:returntype", void 0)
], SystemSettingsController.prototype, "updatePayrollSettings", null);
exports.SystemSettingsController = SystemSettingsController = __decorate([
    (0, swagger_1.ApiTags)('system-settings'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('system-settings'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [system_settings_service_1.SystemSettingsService])
], SystemSettingsController);
//# sourceMappingURL=system-settings.controller.js.map