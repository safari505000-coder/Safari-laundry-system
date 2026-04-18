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
exports.ApproveReceiptFromDriverDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class ApproveReceiptFromDriverDto {
    driverId;
    declaredHandoverTotal;
    note;
}
exports.ApproveReceiptFromDriverDto = ApproveReceiptFromDriverDto;
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'uuid' }),
    (0, class_validator_1.IsUUID)('4'),
    __metadata("design:type", String)
], ApproveReceiptFromDriverDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Physical cash counted by the manager; if provided must match ledger within 0.0001 KWD.',
        example: 450.25,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsPositive)(),
    __metadata("design:type", Number)
], ApproveReceiptFromDriverDto.prototype, "declaredHandoverTotal", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Free-text note (audit)', maxLength: 500 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], ApproveReceiptFromDriverDto.prototype, "note", void 0);
//# sourceMappingURL=approve-receipt-from-driver.dto.js.map