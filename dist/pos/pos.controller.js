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
exports.PosController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const pos_checkout_bundle_dto_1 = require("../orders/dto/pos-checkout-bundle.dto");
const pos_checkout_dto_1 = require("../orders/dto/pos-checkout.dto");
const orders_service_1 = require("../orders/orders.service");
const pos_create_customer_dto_1 = require("./dto/pos-create-customer.dto");
const pos_service_1 = require("./pos.service");
let PosController = class PosController {
    posService;
    ordersService;
    constructor(posService, ordersService) {
        this.posService = posService;
        this.ordersService = ordersService;
    }
    searchCustomers(q) {
        return this.posService.searchCustomers(q ?? '');
    }
    listCustomersForOfflineCache() {
        return this.posService.listCustomersForOfflineDirectory();
    }
    createCustomer(dto) {
        return this.posService.createCustomer(dto);
    }
    getCustomerBilling(customerId) {
        return this.posService.getCustomerBillingProfile(customerId);
    }
    posCheckout(dto, user) {
        return this.ordersService.posCheckout(user.userId, dto);
    }
    posCheckoutBundle(dto, user) {
        return this.ordersService.posCheckoutBundle(user.userId, dto);
    }
};
exports.PosController = PosController;
__decorate([
    (0, common_1.Get)('customers/search'),
    (0, swagger_1.ApiOperation)({
        summary: `Search customers — driver POS (${branding_1.APP_BRAND})`,
    }),
    __param(0, (0, common_1.Query)('q')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "searchCustomers", null);
__decorate([
    (0, common_1.Get)('customers/cache'),
    (0, swagger_1.ApiOperation)({
        summary: `Hydrate offline IndexedDB snapshot — DRIVER/MANAGER POS (${branding_1.APP_BRAND})`,
        description: 'Returns newest customers (cap ~15k) with wallet balance/debt — same projection as `/customers/search`.',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PosController.prototype, "listCustomersForOfflineCache", null);
__decorate([
    (0, common_1.Post)('customers'),
    (0, swagger_1.ApiOperation)({
        summary: `Create customer — driver POS (${branding_1.APP_BRAND})`,
        description: 'Name + mobile only; used for quick checkout.',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pos_create_customer_dto_1.PosCreateCustomerDto]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "createCustomer", null);
__decorate([
    (0, common_1.Get)('customers/:customerId/billing'),
    (0, swagger_1.ApiOperation)({
        summary: `Customer subscription & wallet — POS (${branding_1.APP_BRAND})`,
        description: 'Prepaid balance (subscription credit), debt, and last activated plan name for checkout UI.',
    }),
    __param(0, (0, common_1.Param)('customerId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "getCustomerBilling", null);
__decorate([
    (0, common_1.Post)('checkout'),
    (0, swagger_1.ApiOperation)({
        summary: `Complete POS sale — wallet + payment method (${branding_1.APP_BRAND})`,
        description: 'Cash/KNET/DEBT/wallet: creates COMPLETED order and wallet settlement. ONLINE: creates PENDING order, returns paymentLink URL; gateway callback completes the sale.',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pos_checkout_dto_1.PosCheckoutDto, Object]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "posCheckout", null);
__decorate([
    (0, common_1.Post)('checkout-bundle'),
    (0, swagger_1.ApiOperation)({
        summary: `Multi-invoice POS — one hosted payment for several orders (${branding_1.APP_BRAND})`,
        description: 'Creates multiple PENDING orders linked to one PosPaymentBundle; returns a single paymentLink for the combined total. Gateway callback references the bundle id.',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pos_checkout_bundle_dto_1.PosCheckoutBundleDto, Object]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "posCheckoutBundle", null);
exports.PosController = PosController = __decorate([
    (0, swagger_1.ApiTags)('pos'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('pos'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.DRIVER, client_1.SafariRole.MANAGER),
    __metadata("design:paramtypes", [pos_service_1.PosService,
        orders_service_1.OrdersService])
], PosController);
//# sourceMappingURL=pos.controller.js.map