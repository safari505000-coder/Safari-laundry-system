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
exports.OwnerDashboardController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const owner_dashboard_response_dto_1 = require("./dto/owner-dashboard-response.dto");
const owner_dashboard_service_1 = require("./owner-dashboard.service");
let OwnerDashboardController = class OwnerDashboardController {
    dashboard;
    constructor(dashboard) {
        this.dashboard = dashboard;
    }
    getDashboard() {
        return this.dashboard.getCachedDashboard();
    }
};
exports.OwnerDashboardController = OwnerDashboardController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: 'Owner executive dashboard snapshot',
        description: 'Cached, executive-friendly business and system status. No raw metrics or sensitive diagnostics.',
    }),
    (0, swagger_1.ApiOkResponse)({ type: owner_dashboard_response_dto_1.OwnerDashboardCacheResponseDto }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], OwnerDashboardController.prototype, "getDashboard", null);
exports.OwnerDashboardController = OwnerDashboardController = __decorate([
    (0, swagger_1.ApiTags)('owner-dashboard'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('admin/owner-dashboard'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER),
    __metadata("design:paramtypes", [owner_dashboard_service_1.OwnerDashboardService])
], OwnerDashboardController);
//# sourceMappingURL=owner-dashboard.controller.js.map