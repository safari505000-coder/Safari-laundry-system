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
exports.PosCheckoutBundleDto = exports.PosCheckoutBundlePartDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const kuwait_customer_phone_1 = require("../../common/validation/kuwait-customer-phone");
const order_line_item_dto_1 = require("./order-line-item.dto");
class PosCheckoutBundlePartDto {
    totalPrice;
    lineItems;
}
exports.PosCheckoutBundlePartDto = PosCheckoutBundlePartDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 12.5 }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }),
    __metadata("design:type", Number)
], PosCheckoutBundlePartDto.prototype, "totalPrice", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: [order_line_item_dto_1.OrderLineItemDto] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => order_line_item_dto_1.OrderLineItemDto),
    __metadata("design:type", Array)
], PosCheckoutBundlePartDto.prototype, "lineItems", void 0);
class PosCheckoutBundleDto {
    customerPhone;
    customerId;
    customerDisplayName;
    customerAddress;
    serviceType;
    orders;
}
exports.PosCheckoutBundleDto = PosCheckoutBundleDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '51234567' }),
    (0, class_transformer_1.Transform)(({ value }) => typeof value === 'string' ? value.replace(/[\s-]/g, '').trim() : value),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8),
    (0, kuwait_customer_phone_1.IsKuwaitCustomerPhone)(),
    __metadata("design:type", String)
], PosCheckoutBundleDto.prototype, "customerPhone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ format: 'uuid' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)('4'),
    __metadata("design:type", String)
], PosCheckoutBundleDto.prototype, "customerId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ maxLength: 200 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], PosCheckoutBundleDto.prototype, "customerDisplayName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], PosCheckoutBundleDto.prototype, "customerAddress", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: client_1.ServiceType, enumName: 'ServiceType' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.ServiceType, {
        message: 'serviceType must be EXPRESS or NORMAL',
    }),
    __metadata("design:type", String)
], PosCheckoutBundleDto.prototype, "serviceType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: [PosCheckoutBundlePartDto],
        minItems: 2,
        description: 'Each sub-order total (incl. delivery allocation); one gateway charge for the sum',
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(2, { message: 'At least two sub-orders are required for bundle checkout' }),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => PosCheckoutBundlePartDto),
    __metadata("design:type", Array)
], PosCheckoutBundleDto.prototype, "orders", void 0);
//# sourceMappingURL=pos-checkout-bundle.dto.js.map