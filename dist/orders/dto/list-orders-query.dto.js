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
exports.ListOrdersQueryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class ListOrdersQueryDto {
    driverId;
    status;
    posPaymentMethod;
    cashStatus;
    from;
    to;
    q;
}
exports.ListOrdersQueryDto = ListOrdersQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Filter by assigned driver (UUID). MANAGER: must be a driver of their branch.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], ListOrdersQueryDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: client_1.OrderStatus }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.OrderStatus),
    __metadata("design:type", String)
], ListOrdersQueryDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        enum: client_1.PosPaymentMethod,
        description: 'Declared POS payment method.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.PosPaymentMethod),
    __metadata("design:type", String)
], ListOrdersQueryDto.prototype, "posPaymentMethod", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        enum: client_1.CashStatus,
        description: 'Cash settlement state.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.CashStatus),
    __metadata("design:type", String)
], ListOrdersQueryDto.prototype, "cashStatus", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Inclusive lower bound on createdAt (ISO-8601 date or datetime).',
        example: '2026-04-01',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], ListOrdersQueryDto.prototype, "from", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Inclusive upper bound on createdAt (ISO-8601 date or datetime).',
        example: '2026-04-23',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], ListOrdersQueryDto.prototype, "to", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Free-text search: customer phone, customer name, invoice number, or serial number.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => typeof value === 'string' ? value.trim() : value),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], ListOrdersQueryDto.prototype, "q", void 0);
//# sourceMappingURL=list-orders-query.dto.js.map