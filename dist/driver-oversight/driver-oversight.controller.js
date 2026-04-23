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
exports.DriverOversightController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const driver_oversight_service_1 = require("./driver-oversight.service");
let DriverOversightController = class DriverOversightController {
    svc;
    constructor(svc) {
        this.svc = svc;
    }
    list(user) {
        if (user.role === client_1.SafariRole.MANAGER) {
            return this.svc.listForBranchManager(user.branchId);
        }
        if (user.role === client_1.SafariRole.OWNER ||
            user.role === client_1.SafariRole.GENERAL_MANAGER) {
            return this.svc.listForAllBranches();
        }
        throw new common_1.ForbiddenException('Driver oversight is MANAGER-only.');
    }
};
exports.DriverOversightController = DriverOversightController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.MANAGER, client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Branch Driver Oversight — daily cards (${branding_1.APP_BRAND})`,
        description: 'Returns one `DriverOversightCard` per active DRIVER in the caller\'s scope. MANAGER → drivers of their own branch (`user.branchId`). OWNER / GENERAL_MANAGER → every active driver across the company. Each card bundles shift status, today\'s invoice count + cash, pending unsettled invoices, cash on hand, and the stale quick-capture tally (same 24 h threshold as the Accountant watchdog).',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DriverOversightController.prototype, "list", null);
exports.DriverOversightController = DriverOversightController = __decorate([
    (0, swagger_1.ApiTags)('driver-oversight'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('manager/driver-oversight'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [driver_oversight_service_1.DriverOversightService])
], DriverOversightController);
//# sourceMappingURL=driver-oversight.controller.js.map