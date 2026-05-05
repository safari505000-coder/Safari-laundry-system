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
exports.UnblockCustomerDto = exports.BlockCustomerDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class BlockCustomerDto {
    reason;
}
exports.BlockCustomerDto = BlockCustomerDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        minLength: 3,
        maxLength: 240,
        example: 'العميل يرفض السداد رغم التذكير المتكرر',
        description: 'Operator-supplied reason for the manual block. Stored on Customer.blockReason and embedded in the CUSTOMER_BLOCKED audit log row.',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(240),
    __metadata("design:type", String)
], BlockCustomerDto.prototype, "reason", void 0);
class UnblockCustomerDto {
    reason;
}
exports.UnblockCustomerDto = UnblockCustomerDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        maxLength: 240,
        example: 'تم تسوية الدين كاملًا',
        description: 'Optional narrative for the audit row only. Customer.blockReason is always cleared regardless.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(240),
    __metadata("design:type", String)
], UnblockCustomerDto.prototype, "reason", void 0);
//# sourceMappingURL=block-customer.dto.js.map