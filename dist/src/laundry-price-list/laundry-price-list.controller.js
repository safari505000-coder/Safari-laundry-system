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
exports.LaundryPriceListController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const branding_1 = require("../common/constants/branding");
const laundry_price_list_service_1 = require("./laundry-price-list.service");
let LaundryPriceListController = class LaundryPriceListController {
    laundryPriceListService;
    constructor(laundryPriceListService) {
        this.laundryPriceListService = laundryPriceListService;
    }
    findAll() {
        return this.laundryPriceListService.findAllForApi();
    }
};
exports.LaundryPriceListController = LaundryPriceListController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: `Laundry garment price list (${branding_1.APP_BRAND})`,
        description: 'Official KD prices per item and tier (normal, urgent, press-only, urgent+press). Manual-entry items use 0.000 until staff enters price.',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LaundryPriceListController.prototype, "findAll", null);
exports.LaundryPriceListController = LaundryPriceListController = __decorate([
    (0, swagger_1.ApiTags)('laundry-price-list'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('laundry-price-list'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [laundry_price_list_service_1.LaundryPriceListService])
], LaundryPriceListController);
//# sourceMappingURL=laundry-price-list.controller.js.map