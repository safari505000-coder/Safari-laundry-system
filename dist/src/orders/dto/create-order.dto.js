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
exports.CreateOrderDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const kuwait_customer_phone_1 = require("../../common/validation/kuwait-customer-phone");
const order_line_item_dto_1 = require("./order-line-item.dto");
class CreateOrderDto {
    customerPhone;
    customerAddress;
    serviceType;
    totalPrice;
    invoiceNumber;
    notes;
    driverId;
    lineItems;
}
exports.CreateOrderDto = CreateOrderDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '+96551234567' }),
    (0, class_transformer_1.Transform)(({ value }) => typeof value === 'string' ? value.replace(/[\s-]/g, '').trim() : value),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8),
    (0, kuwait_customer_phone_1.IsKuwaitCustomerPhone)(),
    __metadata("design:type", String)
], CreateOrderDto.prototype, "customerPhone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'Dubai Marina, Tower A',
        description: 'Optional if not yet known',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CreateOrderDto.prototype, "customerAddress", void 0);
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
], CreateOrderDto.prototype, "serviceType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 249.5,
        description: 'Declared total — must be > 0; if lineItems sent, must equal Σ(qty×unitPrice)',
    }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }),
    (0, class_validator_1.IsPositive)(),
    __metadata("design:type", Number)
], CreateOrderDto.prototype, "totalPrice", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'INV-2026-1001',
        description: 'Paper invoice reference when available',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], CreateOrderDto.prototype, "invoiceNumber", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ maxLength: 2000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], CreateOrderDto.prototype, "notes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        format: 'uuid',
        description: 'If set, must be a user with DRIVER role',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)('4'),
    __metadata("design:type", String)
], CreateOrderDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        type: [order_line_item_dto_1.OrderLineItemDto],
        description: 'Optional; when provided, totals are reconciled against totalPrice before save',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1, {
        message: 'When lineItems is provided, at least one line is required',
    }),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => order_line_item_dto_1.OrderLineItemDto),
    __metadata("design:type", Array)
], CreateOrderDto.prototype, "lineItems", void 0);
//# sourceMappingURL=create-order.dto.js.map