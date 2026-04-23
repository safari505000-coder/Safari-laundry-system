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
exports.InventoryReportQueryDto = exports.StockStatusFilter = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var StockStatusFilter;
(function (StockStatusFilter) {
    StockStatusFilter["IN_STOCK"] = "IN_STOCK";
    StockStatusFilter["LOW_STOCK"] = "LOW_STOCK";
    StockStatusFilter["OUT_OF_STOCK"] = "OUT_OF_STOCK";
})(StockStatusFilter || (exports.StockStatusFilter = StockStatusFilter = {}));
class InventoryReportQueryDto {
    categoryId;
    branchId;
    status;
}
exports.InventoryReportQueryDto = InventoryReportQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], InventoryReportQueryDto.prototype, "categoryId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], InventoryReportQueryDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: StockStatusFilter }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(StockStatusFilter),
    __metadata("design:type", String)
], InventoryReportQueryDto.prototype, "status", void 0);
//# sourceMappingURL=inventory-report-query.dto.js.map