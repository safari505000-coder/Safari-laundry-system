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
exports.SubscriptionPlansController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const create_subscription_plan_dto_1 = require("./dto/create-subscription-plan.dto");
const update_subscription_plan_dto_1 = require("./dto/update-subscription-plan.dto");
const subscription_plans_service_1 = require("./subscription-plans.service");
let SubscriptionPlansController = class SubscriptionPlansController {
    subscriptionPlansService;
    constructor(subscriptionPlansService) {
        this.subscriptionPlansService = subscriptionPlansService;
    }
    create(dto) {
        return this.subscriptionPlansService.create(dto);
    }
    findAll() {
        return this.subscriptionPlansService.findAll();
    }
    findOne(id) {
        return this.subscriptionPlansService.findOne(id);
    }
    update(id, dto) {
        return this.subscriptionPlansService.update(id, dto);
    }
    remove(id) {
        return this.subscriptionPlansService.remove(id);
    }
};
exports.SubscriptionPlansController = SubscriptionPlansController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({
        summary: `Create subscription plan (${branding_1.APP_BRAND})`,
        description: 'OWNER only. Defines list price and wallet credit granted on activation.',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_subscription_plan_dto_1.CreateSubscriptionPlanDto]),
    __metadata("design:returntype", void 0)
], SubscriptionPlansController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: `List subscription plans (${branding_1.APP_BRAND})` }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SubscriptionPlansController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: `Get subscription plan (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SubscriptionPlansController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiOperation)({ summary: `Update subscription plan (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_subscription_plan_dto_1.UpdateSubscriptionPlanDto]),
    __metadata("design:returntype", void 0)
], SubscriptionPlansController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: `Delete subscription plan (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SubscriptionPlansController.prototype, "remove", null);
exports.SubscriptionPlansController = SubscriptionPlansController = __decorate([
    (0, swagger_1.ApiTags)('subscription-plans'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('subscription-plans'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    __metadata("design:paramtypes", [subscription_plans_service_1.SubscriptionPlansService])
], SubscriptionPlansController);
//# sourceMappingURL=subscription-plans.controller.js.map