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
exports.CustomersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const permissions_decorator_1 = require("../auth/permissions/permissions.decorator");
const permissions_enum_1 = require("../auth/permissions/permissions.enum");
const branding_1 = require("../common/constants/branding");
const create_customer_quick_dto_1 = require("./dto/create-customer-quick.dto");
const update_customer_dto_1 = require("./dto/update-customer.dto");
const block_customer_dto_1 = require("./dto/block-customer.dto");
const customers_service_1 = require("./customers.service");
const customer_360_service_1 = require("./customer-360.service");
const customer_blocking_service_1 = require("../common/services/customer-blocking.service");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
let CustomersController = class CustomersController {
    customersService;
    customer360;
    customerBlocking;
    constructor(customersService, customer360, customerBlocking) {
        this.customersService = customersService;
        this.customer360 = customer360;
        this.customerBlocking = customerBlocking;
    }
    list(q, user) {
        return this.customersService.list(q, user.role);
    }
    resolveIncomingPhone(phone) {
        return this.customersService.resolveIncomingPhone(phone ?? '');
    }
    createQuick(dto) {
        return this.customersService.createQuick(dto);
    }
    async getCustomer360(customerId, user) {
        return this.customer360.get360(customerId, user);
    }
    getProfile(id, user) {
        return this.customersService.getProfileWithFinancials(id, user.role);
    }
    update(id, dto) {
        return this.customersService.update(id, dto);
    }
    block(id, dto, user) {
        return this.customerBlocking.manualBlock({
            customerId: id,
            reason: dto.reason,
            actorUserId: user.userId,
            actorRole: user.role,
        });
    }
    unblock(id, dto, user) {
        return this.customerBlocking.manualUnblock({
            customerId: id,
            reason: dto.reason ?? null,
            actorUserId: user.userId,
            actorRole: user.role,
        });
    }
};
exports.CustomersController = CustomersController;
__decorate([
    (0, common_1.Get)(),
    (0, permissions_decorator_1.Permissions)(permissions_enum_1.AppPermission.VIEW_CUSTOMERS),
    (0, swagger_1.ApiOperation)({
        summary: `Customer directory (${branding_1.APP_BRAND})`,
    }),
    __param(0, (0, common_1.Query)('q')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CustomersController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('resolve-incoming-phone'),
    (0, permissions_decorator_1.Permissions)(permissions_enum_1.AppPermission.VIEW_CUSTOMERS),
    (0, swagger_1.ApiOperation)({
        summary: 'Resolve caller ID (PBX) to a single customer when possible',
    }),
    __param(0, (0, common_1.Query)('phone')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CustomersController.prototype, "resolveIncomingPhone", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.CALL_CENTER, client_1.SafariRole.CALL_CENTER_SUPERVISOR, client_1.SafariRole.SUPERVISOR),
    (0, swagger_1.ApiOperation)({
        summary: 'Create customer (minimal — Call Center / CTI handoff)',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_customer_quick_dto_1.CreateCustomerQuickDto]),
    __metadata("design:returntype", void 0)
], CustomersController.prototype, "createQuick", null);
__decorate([
    (0, common_1.Get)(':customerId/360'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.CALL_CENTER, client_1.SafariRole.CALL_CENTER_SUPERVISOR, client_1.SafariRole.CUSTOMER),
    (0, swagger_1.ApiOperation)({
        summary: `Customer 360 (${branding_1.APP_BRAND})`,
        description: 'Unified snapshot: financials, subscriptions, internal score/insights for call center; sanitized presentation for CUSTOMER role. View mode is derived from JWT only.',
    }),
    __param(0, (0, common_1.Param)('customerId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CustomersController.prototype, "getCustomer360", null);
__decorate([
    (0, common_1.Get)(':id/profile'),
    (0, permissions_decorator_1.Permissions)(permissions_enum_1.AppPermission.VIEW_CUSTOMERS),
    (0, swagger_1.ApiOperation)({
        summary: `Customer profile (core + financial snapshot) (${branding_1.APP_BRAND})`,
        description: 'Core profile is served by CustomerCoreService; financial snapshot is fetched via DebtService + SubscriptionService (no finance logic inside customers).',
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], CustomersController.prototype, "getProfile", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.CALL_CENTER, client_1.SafariRole.CALL_CENTER_SUPERVISOR, client_1.SafariRole.SUPERVISOR),
    (0, swagger_1.ApiOperation)({
        summary: `Update customer contact profile (${branding_1.APP_BRAND})`,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_customer_dto_1.UpdateCustomerDto]),
    __metadata("design:returntype", void 0)
], CustomersController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/block'),
    (0, permissions_decorator_1.Permissions)(permissions_enum_1.AppPermission.MANAGE_CUSTOMER_BLOCK),
    (0, swagger_1.ApiOperation)({
        summary: 'Block customer (manual — call center)',
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, block_customer_dto_1.BlockCustomerDto, Object]),
    __metadata("design:returntype", void 0)
], CustomersController.prototype, "block", null);
__decorate([
    (0, common_1.Post)(':id/unblock'),
    (0, permissions_decorator_1.Permissions)(permissions_enum_1.AppPermission.MANAGE_CUSTOMER_BLOCK),
    (0, swagger_1.ApiOperation)({
        summary: 'Unblock customer (manual — call center)',
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, block_customer_dto_1.UnblockCustomerDto, Object]),
    __metadata("design:returntype", void 0)
], CustomersController.prototype, "unblock", null);
exports.CustomersController = CustomersController = __decorate([
    (0, swagger_1.ApiTags)('customers'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('customers'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [customers_service_1.CustomersService,
        customer_360_service_1.Customer360Service,
        customer_blocking_service_1.CustomerBlockingService])
], CustomersController);
//# sourceMappingURL=customers.controller.js.map