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
exports.EditInvoiceDto = exports.EditInvoiceLineItemDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class EditInvoiceLineItemDto {
    id;
    label;
    starchOption;
    quantity;
    unitPrice;
}
exports.EditInvoiceLineItemDto = EditInvoiceLineItemDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Existing line-item id to update; omit to insert a new one.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], EditInvoiceLineItemDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Human-readable label (service / garment description).',
        maxLength: 200,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], EditInvoiceLineItemDto.prototype, "label", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        enum: client_1.StarchOption,
        description: 'Optional starch preference for garment lines.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.StarchOption),
    __metadata("design:type", String)
], EditInvoiceLineItemDto.prototype, "starchOption", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Quantity, string to preserve 4-dp Decimal precision.',
        example: '1.000',
    }),
    (0, class_validator_1.IsNumberString)({ no_symbols: false }),
    __metadata("design:type", String)
], EditInvoiceLineItemDto.prototype, "quantity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Unit price in KWD (3-dp).',
        example: '2.500',
    }),
    (0, class_validator_1.IsNumberString)({ no_symbols: false }),
    __metadata("design:type", String)
], EditInvoiceLineItemDto.prototype, "unitPrice", void 0);
class EditInvoiceDto {
    totalPrice;
    posPaymentMethod;
    notes;
    reason;
    lineItems;
}
exports.EditInvoiceDto = EditInvoiceDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'New total price in KWD, string to preserve 3-dp precision. Ignored when `lineItems` is supplied — total is then recomputed from Σ(qty × unitPrice).',
        example: '12.500',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumberString)({ no_symbols: false }),
    __metadata("design:type", String)
], EditInvoiceDto.prototype, "totalPrice", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        enum: client_1.PosPaymentMethod,
        description: 'Switch the payment method',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.PosPaymentMethod),
    __metadata("design:type", String)
], EditInvoiceDto.prototype, "posPaymentMethod", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Free-text notes / remarks',
        maxLength: 500,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], EditInvoiceDto.prototype, "notes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Optional free-text reason for the edit (audit metadata)',
        maxLength: 500,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], EditInvoiceDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        type: [EditInvoiceLineItemDto],
        description: 'Full replacement set of line items. When provided, the service diffs against existing lines: rows with matching `id` are updated, rows without `id` are inserted, and existing rows missing from the payload are deleted. `totalPrice` is then auto-recomputed.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(100),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => EditInvoiceLineItemDto),
    __metadata("design:type", Array)
], EditInvoiceDto.prototype, "lineItems", void 0);
//# sourceMappingURL=edit-invoice.dto.js.map