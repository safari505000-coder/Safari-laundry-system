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
exports.InventoryController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const create_inventory_category_dto_1 = require("./dto/create-inventory-category.dto");
const create_stock_item_dto_1 = require("./dto/create-stock-item.dto");
const create_supplier_dto_1 = require("./dto/create-supplier.dto");
const inventory_report_query_dto_1 = require("./dto/inventory-report-query.dto");
const stock_in_dto_1 = require("./dto/stock-in.dto");
const inventory_service_1 = require("./inventory.service");
let InventoryController = class InventoryController {
    inventory;
    constructor(inventory) {
        this.inventory = inventory;
    }
    getReport(q) {
        return this.inventory.report(q);
    }
    listCategories() {
        return this.inventory.listCategories();
    }
    createCategory(dto) {
        return this.inventory.createCategory(dto);
    }
    listItems() {
        return this.inventory.listItems();
    }
    createItem(dto) {
        return this.inventory.createItem(dto);
    }
    listSuppliers() {
        return this.inventory.listSuppliers();
    }
    createSupplier(dto) {
        return this.inventory.createSupplier(dto);
    }
    stockIn(dto, user) {
        return this.inventory.stockIn(dto, user.userId);
    }
    listMovements(branchId, limit) {
        const n = limit ? Number(limit) : 50;
        return this.inventory.listRecentMovements(Number.isFinite(n) ? n : 50, branchId?.trim() || undefined);
    }
};
exports.InventoryController = InventoryController;
__decorate([
    (0, common_1.Get)('report'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({
        summary: `Smart inventory report (${branding_1.APP_BRAND})`,
        description: 'Multi-layer filter: category, branch, stock-status. Rows return a server-derived status (IN_STOCK / LOW_STOCK / OUT_OF_STOCK) used for the Yellow/Red colour cues in the UI.',
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [inventory_report_query_dto_1.InventoryReportQueryDto]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "getReport", null);
__decorate([
    (0, common_1.Get)('categories'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.MANAGER),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "listCategories", null);
__decorate([
    (0, common_1.Post)('categories'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_inventory_category_dto_1.CreateInventoryCategoryDto]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "createCategory", null);
__decorate([
    (0, common_1.Get)('items'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.MANAGER),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "listItems", null);
__decorate([
    (0, common_1.Post)('items'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_stock_item_dto_1.CreateStockItemDto]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "createItem", null);
__decorate([
    (0, common_1.Get)('suppliers'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "listSuppliers", null);
__decorate([
    (0, common_1.Post)('suppliers'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.GENERAL_MANAGER),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_supplier_dto_1.CreateSupplierDto]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "createSupplier", null);
__decorate([
    (0, common_1.Post)('stock-in'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Record stock-in (ACCOUNTANT) (${branding_1.APP_BRAND})`,
        description: 'Creates a STOCK_IN movement row, increments BranchStockLevel.quantityOnHand, and updates the weighted moving-average unit cost. Auto-creates a supplier row when supplierName is provided without supplierId.',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [stock_in_dto_1.StockInDto, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "stockIn", null);
__decorate([
    (0, common_1.Get)('movements'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    __param(0, (0, common_1.Query)('branchId')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "listMovements", null);
exports.InventoryController = InventoryController = __decorate([
    (0, swagger_1.ApiTags)('inventory'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('inventory'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [inventory_service_1.InventoryService])
], InventoryController);
//# sourceMappingURL=inventory.controller.js.map