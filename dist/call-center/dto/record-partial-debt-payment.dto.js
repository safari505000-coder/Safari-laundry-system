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
exports.RecordPartialDebtPaymentDto = exports.DEBT_PAYMENT_METHODS = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
exports.DEBT_PAYMENT_METHODS = [
    'CASH',
    'KNET',
    'PAYMENT_LINK',
    'ONLINE',
];
class RecordPartialDebtPaymentDto {
    amountKd;
    discountKd;
    paymentMethod;
    note;
}
exports.RecordPartialDebtPaymentDto = RecordPartialDebtPaymentDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Cash actually collected from the customer (excludes discount). Zero means the operator only applied a goodwill discount with no money changing hands.',
        example: '1.5000',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^\d+(\.\d{1,4})?$/, {
        message: 'amountKd must be a non-negative decimal with up to 4 decimals',
    }),
    __metadata("design:type", String)
], RecordPartialDebtPaymentDto.prototype, "amountKd", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Optional goodwill discount applied on top of the collected amount. Reduces the customer debt without a corresponding cash receipt. Reports tag this separately so it never inflates the "Collected Today" KPI.',
        example: '0.5000',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^\d+(\.\d{1,4})?$/, {
        message: 'discountKd must be a non-negative decimal with up to 4 decimals',
    }),
    __metadata("design:type", String)
], RecordPartialDebtPaymentDto.prototype, "discountKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: exports.DEBT_PAYMENT_METHODS,
        example: 'CASH',
        description: 'Method the customer actually used for the collected portion. Ignored when `amountKd` is 0 (discount-only forgiveness).',
    }),
    (0, class_validator_1.IsIn)(exports.DEBT_PAYMENT_METHODS),
    __metadata("design:type", String)
], RecordPartialDebtPaymentDto.prototype, "paymentMethod", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Optional free-text note stored on the ledger metadata so future audits can see why a discount was granted or which driver relayed the cash.',
        maxLength: 240,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(240),
    __metadata("design:type", String)
], RecordPartialDebtPaymentDto.prototype, "note", void 0);
//# sourceMappingURL=record-partial-debt-payment.dto.js.map