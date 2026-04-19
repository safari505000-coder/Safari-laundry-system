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
exports.OrdersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const assign_driver_dto_1 = require("./dto/assign-driver.dto");
const create_order_dto_1 = require("./dto/create-order.dto");
const create_order_quick_dto_1 = require("./dto/create-order-quick.dto");
const update_order_dto_1 = require("./dto/update-order.dto");
const orders_service_1 = require("./orders.service");
let OrdersController = class OrdersController {
    ordersService;
    constructor(ordersService) {
        this.ordersService = ordersService;
    }
    getManagerDashboard() {
        return this.ordersService.getManagerDashboard();
    }
    createQuick(dto, user) {
        return this.ordersService.createQuick(user.userId, dto);
    }
    create(dto) {
        return this.ordersService.createAsManager(dto);
    }
    findAll(user) {
        return this.ordersService.findAllForActor(user.userId, user.role);
    }
    listCollectionsUnpaidOnline(branchId) {
        const raw = (branchId ?? '').trim();
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const scoped = raw && uuidRe.test(raw) ? raw : null;
        return this.ordersService.listUnpaidCollectionOrders(scoped);
    }
    listDriverPendingInvoices(user) {
        return this.ordersService.listDriverPendingInvoices(user.userId);
    }
    findOne(id, user) {
        return this.ordersService.findOneForActor(id, user.userId, user.role);
    }
    assignDriver(id, dto) {
        return this.ordersService.assignDriver(id, dto);
    }
    updateOrder(id, dto, user) {
        return this.ordersService.updateOrder(id, dto, user.userId, user.role);
    }
};
exports.OrdersController = OrdersController;
__decorate([
    (0, common_1.Get)('manager-dashboard'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER, client_1.SafariRole.SUPERVISOR, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.VIEWER),
    (0, swagger_1.ApiOperation)({
        summary: `Manager dashboard — orders & driver contribution (${branding_1.APP_BRAND})`,
        description: 'Active pipeline count, completed revenue, and per-driver completed volume/revenue (driver-led business). OWNER/MANAGER only.',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "getManagerDashboard", null);
__decorate([
    (0, common_1.Post)('quick'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.DRIVER),
    (0, swagger_1.ApiOperation)({
        summary: `Quick create order — driver (${branding_1.APP_BRAND})`,
        description: 'Mobile-first: **Kuwait mobile** (+965 optional, 8 digits starting 5/6/9), **totalPrice > 0**, optional **lineItems** (Σ qty×price must equal total). Auto-assigned to the authenticated driver.',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_order_quick_dto_1.CreateOrderQuickDto, Object]),
    __metadata("design:returntype", void 0)
], OrdersController.prototype, "createQuick", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.MANAGER, client_1.SafariRole.CALL_CENTER),
    (0, swagger_1.ApiOperation)({
        summary: `Create order — back office (${branding_1.APP_BRAND})`,
        description: 'Same validation as driver quick create: Kuwait phone, **totalPrice > 0**, **EXPRESS|NORMAL**, optional **lineItems** with total reconciliation. Optional driver assignment. Branch managers and call center only (drivers use POST /orders/quick).',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_order_dto_1.CreateOrderDto]),
    __metadata("design:returntype", void 0)
], OrdersController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: `List orders (${branding_1.APP_BRAND})`,
        description: 'OWNER/MANAGER: entire fleet. DRIVER: only orders assigned to them (including self-created).',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], OrdersController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('collections/unpaid-online'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.CALL_CENTER, client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Debt-Tracking — every unpaid invoice (${branding_1.APP_BRAND})`,
        description: 'V1.6.5: Financial Oversight Report feeding the Collections debt table. Returns ALL non-canceled orders with cashStatus=UNPAID, regardless of payment method (Cash, KNET, Payment Link, Online, Wallet, Debt-on-account). Pass `?branchId=<uuid>` to scope the table to a single branch — the Red-card KPI uses the same scope so the footer sum equals the KPI to the last fils. Amounts are serialized with 3 decimals (KWD standard).',
    }),
    __param(0, (0, common_1.Query)('branchId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], OrdersController.prototype, "listCollectionsUnpaidOnline", null);
__decorate([
    (0, common_1.Get)('driver/pending-invoices'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.DRIVER),
    (0, swagger_1.ApiOperation)({
        summary: `Driver Field Collection Tracker — my unpaid invoices (${branding_1.APP_BRAND})`,
        description: 'V3.8 (Driver island): READ-ONLY list of the authenticated driver\'s own unpaid, non-canceled orders. Filter: `driverId === me` AND `cashStatus === UNPAID`. Sort: `createdAt DESC`. Amounts serialized at 3 decimals (KWD standard). Strictly isolated from the Call Center debt-recovery workflow — no WhatsApp / Payment-Link side-effects, and the aggregated KPIs in `/api/call-center/operations-summary` remain untouched.',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], OrdersController.prototype, "listDriverPendingInvoices", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: `Get order by id (${branding_1.APP_BRAND})`,
        description: 'OWNER/MANAGER: any order. DRIVER: only if they are the assigned driver.',
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], OrdersController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id/assign-driver'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.MANAGER, client_1.SafariRole.SUPERVISOR),
    (0, swagger_1.ApiOperation)({
        summary: `Assign or reassign driver (${branding_1.APP_BRAND})`,
        description: 'Branch manager or supervisor. Not allowed when order is COMPLETED or CANCELED.',
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, assign_driver_dto_1.AssignDriverDto]),
    __metadata("design:returntype", void 0)
], OrdersController.prototype, "assignDriver", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: `Update order status / notes (${branding_1.APP_BRAND})`,
        description: '**State machine**: e.g. COMPLETED only from OUT_FOR_DELIVERY; PICKED_UP requires an assigned driver. DRIVER: own orders only. MANAGER/SUPERVISOR: any order. OWNER and other roles: read-only (no updates).',
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_order_dto_1.UpdateOrderDto, Object]),
    __metadata("design:returntype", void 0)
], OrdersController.prototype, "updateOrder", null);
exports.OrdersController = OrdersController = __decorate([
    (0, swagger_1.ApiTags)('orders'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('orders'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [orders_service_1.OrdersService])
], OrdersController);
//# sourceMappingURL=orders.controller.js.map