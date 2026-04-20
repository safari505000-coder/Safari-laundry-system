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
exports.CreatePurchaseOrderDto = exports.CreatePurchaseOrderLineDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class CreatePurchaseOrderLineDto {
    stockItemId;
    quantityOrdered;
    unitCost;
}
exports.CreatePurchaseOrderLineDto = CreatePurchaseOrderLineDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreatePurchaseOrderLineDto.prototype, "stockItemId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Quantity ordered (positive units)' }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }),
    (0, class_validator_1.IsPositive)(),
    __metadata("design:type", Number)
], CreatePurchaseOrderLineDto.prototype, "quantityOrdered", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Per-unit purchase cost in KD' }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreatePurchaseOrderLineDto.prototype, "unitCost", void 0);
class CreatePurchaseOrderDto {
    supplierId;
    branchId;
    lines;
    expectedAt;
    notes;
}
exports.CreatePurchaseOrderDto = CreatePurchaseOrderDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreatePurchaseOrderDto.prototype, "supplierId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Branch that will receive the goods' }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreatePurchaseOrderDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => [CreatePurchaseOrderLineDto] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => CreatePurchaseOrderLineDto),
    __metadata("design:type", Array)
], CreatePurchaseOrderDto.prototype, "lines", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Expected delivery ISO timestamp' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], CreatePurchaseOrderDto.prototype, "expectedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], CreatePurchaseOrderDto.prototype, "notes", void 0);
//# sourceMappingURL=create-purchase-order.dto.js.map