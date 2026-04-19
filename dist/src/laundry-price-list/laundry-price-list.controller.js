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
exports.LaundryPriceListController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const create_laundry_price_item_dto_1 = require("./dto/create-laundry-price-item.dto");
const update_laundry_category_dto_1 = require("./dto/update-laundry-category.dto");
const update_laundry_price_item_dto_1 = require("./dto/update-laundry-price-item.dto");
const laundry_price_list_service_1 = require("./laundry-price-list.service");
let LaundryPriceListController = class LaundryPriceListController {
    laundryPriceListService;
    constructor(laundryPriceListService) {
        this.laundryPriceListService = laundryPriceListService;
    }
    findCategories() {
        return this.laundryPriceListService.findCategoriesForApi();
    }
    findAll(branchId, user) {
        const q = branchId?.trim();
        const effective = q && q.length > 0 ? q : (user.branchId ?? null);
        return this.laundryPriceListService.findPriceListForBranch(effective);
    }
    createItem(dto) {
        return this.laundryPriceListService.createPriceItem(dto);
    }
    updateItem(id, dto) {
        return this.laundryPriceListService.updatePriceItem(id, dto);
    }
    deleteItem(id) {
        return this.laundryPriceListService.deletePriceItem(id);
    }
    updateCategory(id, dto) {
        return this.laundryPriceListService.updateCategory(id, dto);
    }
};
exports.LaundryPriceListController = LaundryPriceListController;
__decorate([
    (0, common_1.Get)('categories'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER, client_1.SafariRole.DRIVER, client_1.SafariRole.WORKER, client_1.SafariRole.CALL_CENTER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.SUPERVISOR, client_1.SafariRole.VIEWER),
    (0, swagger_1.ApiOperation)({ summary: 'Laundry item categories (ordering / grouping)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LaundryPriceListController.prototype, "findCategories", null);
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER, client_1.SafariRole.DRIVER, client_1.SafariRole.WORKER, client_1.SafariRole.CALL_CENTER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.SUPERVISOR, client_1.SafariRole.VIEWER),
    (0, swagger_1.ApiOperation)({
        summary: `Laundry garment price list (${branding_1.APP_BRAND})`,
        description: 'Official KD prices per item and tier, merged with optional branch overrides. Pass branchId query to preview another branch; otherwise the JWT user branch (when present) is used.',
    }),
    __param(0, (0, common_1.Query)('branchId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], LaundryPriceListController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)('items'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Create master price item — OWNER only (${branding_1.APP_BRAND})`,
        description: 'Creates a new laundry tariff row. Prices default to 0 when omitted so the Owner can batch-create items and price them later. The catalog version bumps automatically for live sync across Driver / POS clients.',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_laundry_price_item_dto_1.CreateLaundryPriceItemDto]),
    __metadata("design:returntype", void 0)
], LaundryPriceListController.prototype, "createItem", null);
__decorate([
    (0, common_1.Patch)('items/:id'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Update master price item — OWNER only (${branding_1.APP_BRAND})`,
        description: 'Partial update of the master tariff row (prices, name, sort order, category, isActive). Writes bump the catalog version exposed via SafariStream so driver devices auto-reload the POS catalog on next poll. Historical orders are never rewritten — OrderLineItem snapshots unit price and label at creation time.',
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_laundry_price_item_dto_1.UpdateLaundryPriceItemDto]),
    __metadata("design:returntype", void 0)
], LaundryPriceListController.prototype, "updateItem", null);
__decorate([
    (0, common_1.Delete)('items/:id'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: `Delete master price item — OWNER only (${branding_1.APP_BRAND})`,
        description: 'Hard-deletes a tariff row. Refused with 400 when any existing order line already references the item by label (to preserve historical invoices). Owners should then flip `isActive=false` via PATCH to soft-hide instead.',
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], LaundryPriceListController.prototype, "deleteItem", null);
__decorate([
    (0, common_1.Patch)('categories/:id'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Update item category — OWNER only (${branding_1.APP_BRAND})`,
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_laundry_category_dto_1.UpdateLaundryCategoryDto]),
    __metadata("design:returntype", void 0)
], LaundryPriceListController.prototype, "updateCategory", null);
exports.LaundryPriceListController = LaundryPriceListController = __decorate([
    (0, swagger_1.ApiTags)('laundry-price-list'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('laundry-price-list'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [laundry_price_list_service_1.LaundryPriceListService])
], LaundryPriceListController);
//# sourceMappingURL=laundry-price-list.controller.js.map