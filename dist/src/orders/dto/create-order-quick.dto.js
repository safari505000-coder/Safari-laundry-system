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
exports.CreateOrderQuickDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const kuwait_customer_phone_1 = require("../../common/validation/kuwait-customer-phone");
const order_line_item_dto_1 = require("./order-line-item.dto");
class CreateOrderQuickDto {
    customerPhone;
    customerId;
    customerDisplayName;
    totalPrice;
    invoiceNumber;
    notes;
    customerAddress;
    serviceType;
    lineItems;
}
exports.CreateOrderQuickDto = CreateOrderQuickDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '51234567' }),
    (0, class_transformer_1.Transform)(({ value }) => typeof value === 'string' ? value.replace(/[\s-]/g, '').trim() : value),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8),
    (0, kuwait_customer_phone_1.IsKuwaitCustomerPhone)(),
    __metadata("design:type", String)
], CreateOrderQuickDto.prototype, "customerPhone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        format: 'uuid',
        description: 'When set, order is attached to this customer (phone must match customerPhone)',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)('4'),
    __metadata("design:type", String)
], CreateOrderQuickDto.prototype, "customerId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        maxLength: 200,
        description: 'Saved on customer when creating or updating',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreateOrderQuickDto.prototype, "customerDisplayName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 120.5,
        description: 'Declared order total — must be > 0; if lineItems sent, must equal their sum',
    }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }),
    (0, class_validator_1.IsPositive)(),
    __metadata("design:type", Number)
], CreateOrderQuickDto.prototype, "totalPrice", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'INV-2026-88421',
        description: 'Optional until the paper invoice is available',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], CreateOrderQuickDto.prototype, "invoiceNumber", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Customer asked for call before delivery' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], CreateOrderQuickDto.prototype, "notes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Skip on mobile if unknown; can be updated later',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CreateOrderQuickDto.prototype, "customerAddress", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        enum: client_1.ServiceType,
        enumName: 'ServiceType',
        description: 'Must be EXPRESS or NORMAL when supplied; defaults to NORMAL',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.ServiceType, {
        message: 'serviceType must be EXPRESS or NORMAL',
    }),
    __metadata("design:type", String)
], CreateOrderQuickDto.prototype, "serviceType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        type: [order_line_item_dto_1.OrderLineItemDto],
        description: 'Optional line items; when present, Σ(qty×unitPrice) must match totalPrice (safety check)',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1, {
        message: 'When lineItems is provided, at least one line is required',
    }),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => order_line_item_dto_1.OrderLineItemDto),
    __metadata("design:type", Array)
], CreateOrderQuickDto.prototype, "lineItems", void 0);
//# sourceMappingURL=create-order-quick.dto.js.map