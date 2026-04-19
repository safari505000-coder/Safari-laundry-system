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
exports.SubscribersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const subscribers_service_1 = require("./subscribers.service");
let SubscribersController = class SubscribersController {
    subscribersService;
    constructor(subscribersService) {
        this.subscribersService = subscribersService;
    }
    list() {
        return this.subscribersService.list();
    }
};
exports.SubscribersController = SubscribersController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.CALL_CENTER),
    (0, swagger_1.ApiOperation)({
        summary: `Subscriber list (${branding_1.APP_BRAND})`,
        description: 'Live list of customers with subscription history or an active subscription window. OWNER and CALL_CENTER.',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SubscribersController.prototype, "list", null);
exports.SubscribersController = SubscribersController = __decorate([
    (0, swagger_1.ApiTags)('subscribers'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('subscribers'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [subscribers_service_1.SubscribersService])
], SubscribersController);
//# sourceMappingURL=subscribers.controller.js.map