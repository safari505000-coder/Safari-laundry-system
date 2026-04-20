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
exports.ReceivePurchaseOrderDto = exports.ReceivePurchaseOrderLineDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class ReceivePurchaseOrderLineDto {
    purchaseOrderLineId;
    quantityReceived;
    unitCost;
}
exports.ReceivePurchaseOrderLineDto = ReceivePurchaseOrderLineDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'PurchaseOrderLine.id to receive against' }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], ReceivePurchaseOrderLineDto.prototype, "purchaseOrderLineId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Quantity received in this delivery (positive)' }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }),
    (0, class_validator_1.IsPositive)(),
    __metadata("design:type", Number)
], ReceivePurchaseOrderLineDto.prototype, "quantityReceived", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Override unit cost for this receipt line (defaults to PO line unit cost)',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ReceivePurchaseOrderLineDto.prototype, "unitCost", void 0);
class ReceivePurchaseOrderDto {
    lines;
    note;
}
exports.ReceivePurchaseOrderDto = ReceivePurchaseOrderDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => [ReceivePurchaseOrderLineDto] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => ReceivePurchaseOrderLineDto),
    __metadata("design:type", Array)
], ReceivePurchaseOrderDto.prototype, "lines", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], ReceivePurchaseOrderDto.prototype, "note", void 0);
//# sourceMappingURL=receive-purchase-order.dto.js.map