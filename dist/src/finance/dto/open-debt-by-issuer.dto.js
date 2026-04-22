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
exports.OpenDebtByIssuerResponseDto = exports.OpenDebtByIssuerRowDto = exports.OpenDebtByIssuerQueryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class OpenDebtByIssuerQueryDto {
    branchId;
}
exports.OpenDebtByIssuerQueryDto = OpenDebtByIssuerQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Optional branch scope. When set, only invoices whose debt-ledger branchId matches are counted.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], OpenDebtByIssuerQueryDto.prototype, "branchId", void 0);
class OpenDebtByIssuerRowDto {
    issuer;
    openDebtKd;
    openInvoiceCount;
    openCustomerCount;
}
exports.OpenDebtByIssuerRowDto = OpenDebtByIssuerRowDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OpenDebtByIssuerRowDto.prototype, "issuer", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '1387.0000' }),
    __metadata("design:type", String)
], OpenDebtByIssuerRowDto.prototype, "openDebtKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 14 }),
    __metadata("design:type", Number)
], OpenDebtByIssuerRowDto.prototype, "openInvoiceCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 9 }),
    __metadata("design:type", Number)
], OpenDebtByIssuerRowDto.prototype, "openCustomerCount", void 0);
class OpenDebtByIssuerResponseDto {
    rows;
    totalOpenDebtKd;
    openInvoiceCount;
    openCustomerCount;
    computedAt;
}
exports.OpenDebtByIssuerResponseDto = OpenDebtByIssuerResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [OpenDebtByIssuerRowDto] }),
    __metadata("design:type", Array)
], OpenDebtByIssuerResponseDto.prototype, "rows", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '1428.2500' }),
    __metadata("design:type", String)
], OpenDebtByIssuerResponseDto.prototype, "totalOpenDebtKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 23 }),
    __metadata("design:type", Number)
], OpenDebtByIssuerResponseDto.prototype, "openInvoiceCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 11 }),
    __metadata("design:type", Number)
], OpenDebtByIssuerResponseDto.prototype, "openCustomerCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'ISO timestamp when the snapshot was computed.',
        example: '2026-04-22T12:30:45.123Z',
    }),
    __metadata("design:type", String)
], OpenDebtByIssuerResponseDto.prototype, "computedAt", void 0);
//# sourceMappingURL=open-debt-by-issuer.dto.js.map