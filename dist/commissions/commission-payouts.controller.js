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
exports.CommissionPayoutsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const commission_payouts_service_1 = require("./commission-payouts.service");
const list_commission_payouts_dto_1 = require("./dto/list-commission-payouts.dto");
let CommissionPayoutsController = class CommissionPayoutsController {
    service;
    constructor(service) {
        this.service = service;
    }
    list(q, user) {
        return this.service.list(user.role, user.userId, q);
    }
};
exports.CommissionPayoutsController = CommissionPayoutsController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.MANAGER, client_1.SafariRole.DRIVER, client_1.SafariRole.CALL_CENTER, client_1.SafariRole.CALL_CENTER_SUPERVISOR, client_1.SafariRole.SUPERVISOR, client_1.SafariRole.VIEWER),
    (0, swagger_1.ApiOperation)({
        summary: `List commission payouts in date range (${branding_1.APP_BRAND})`,
        description: 'Admin roles see everyone; individual employees only their own payouts.',
    }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [list_commission_payouts_dto_1.ListCommissionPayoutsDto, Object]),
    __metadata("design:returntype", void 0)
], CommissionPayoutsController.prototype, "list", null);
exports.CommissionPayoutsController = CommissionPayoutsController = __decorate([
    (0, swagger_1.ApiTags)('commission-payouts'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('commission-payouts'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [commission_payouts_service_1.CommissionPayoutsService])
], CommissionPayoutsController);
//# sourceMappingURL=commission-payouts.controller.js.map