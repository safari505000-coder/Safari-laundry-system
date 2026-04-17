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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RolesGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const client_1 = require("@prisma/client");
const capabilities_1 = require("../capabilities");
const roles_decorator_1 = require("../decorators/roles.decorator");
const permissions_service_1 = require("../../permissions/permissions.service");
let RolesGuard = class RolesGuard {
    reflector;
    permissionsService;
    constructor(reflector, permissionsService) {
        this.reflector = reflector;
        this.permissionsService = permissionsService;
    }
    async canActivate(context) {
        const required = this.reflector.getAllAndOverride(roles_decorator_1.ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!required?.length) {
            return true;
        }
        const req = context
            .switchToHttp()
            .getRequest();
        const role = req.user?.role;
        if (role === client_1.SafariRole.OWNER) {
            return true;
        }
        const driverDailyPos = this.reflector.getAllAndOverride(roles_decorator_1.DRIVER_FINANCE_DAILY_POS_KEY, [context.getHandler(), context.getClass()]);
        if (driverDailyPos &&
            role === client_1.SafariRole.DRIVER &&
            (await this.permissionsService.roleHasCapability(role, capabilities_1.FINANCE_DAILY_POS_SALES_OWN))) {
            return true;
        }
        if (!role || !required.includes(role)) {
            throw new common_1.ForbiddenException('Your role is not permitted to access this resource.');
        }
        return true;
    }
};
exports.RolesGuard = RolesGuard;
exports.RolesGuard = RolesGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        permissions_service_1.PermissionsService])
], RolesGuard);
//# sourceMappingURL=roles.guard.js.map