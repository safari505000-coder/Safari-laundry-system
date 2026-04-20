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
exports.PurchaseOrdersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const create_purchase_order_dto_1 = require("./dto/create-purchase-order.dto");
const list_purchase_orders_query_dto_1 = require("./dto/list-purchase-orders-query.dto");
const receive_purchase_order_dto_1 = require("./dto/receive-purchase-order.dto");
const purchase_orders_service_1 = require("./purchase-orders.service");
let PurchaseOrdersController = class PurchaseOrdersController {
    service;
    constructor(service) {
        this.service = service;
    }
    list(q) {
        return this.service.list(q);
    }
    findOne(id) {
        return this.service.findOne(id);
    }
    create(dto, user) {
        return this.service.create(dto, user.userId);
    }
    send(id, user) {
        return this.service.send(id, user.userId);
    }
    cancel(id, dto, user) {
        return this.service.cancel(id, dto?.reason, user.userId);
    }
    receive(id, dto, user) {
        return this.service.receive(id, dto, user.userId);
    }
};
exports.PurchaseOrdersController = PurchaseOrdersController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({ summary: `List purchase orders (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [list_purchase_orders_query_dto_1.ListPurchaseOrdersQueryDto]),
    __metadata("design:returntype", void 0)
], PurchaseOrdersController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({ summary: `Get purchase order details (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PurchaseOrdersController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({ summary: `Create a DRAFT purchase order (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_purchase_order_dto_1.CreatePurchaseOrderDto, Object]),
    __metadata("design:returntype", void 0)
], PurchaseOrdersController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/send'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({ summary: `Transition DRAFT → SENT (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PurchaseOrdersController.prototype, "send", null);
__decorate([
    (0, common_1.Post)(':id/cancel'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({ summary: `Cancel a purchase order (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchaseOrdersController.prototype, "cancel", null);
__decorate([
    (0, common_1.Post)(':id/receive'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({
        summary: `Record a delivery against a PO (${branding_1.APP_BRAND})`,
        description: 'Partial or full receipt. Creates StockMovement(STOCK_IN) rows via InventoryService and transitions PO to PARTIALLY_RECEIVED / RECEIVED.',
    }),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, receive_purchase_order_dto_1.ReceivePurchaseOrderDto, Object]),
    __metadata("design:returntype", void 0)
], PurchaseOrdersController.prototype, "receive", null);
exports.PurchaseOrdersController = PurchaseOrdersController = __decorate([
    (0, swagger_1.ApiTags)('purchase-orders'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('purchase-orders'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [purchase_orders_service_1.PurchaseOrdersService])
], PurchaseOrdersController);
//# sourceMappingURL=purchase-orders.controller.js.map