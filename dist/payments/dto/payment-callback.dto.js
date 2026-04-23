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
exports.PaymentCallbackDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class PaymentCallbackDto {
    trackId;
    TrackID;
    paymentId;
    result;
    tranId;
    reference;
    auth;
    customerExtraData;
    orderId;
    status;
    amount;
    signature;
    gatewayReference;
    devMock;
}
exports.PaymentCallbackDto = PaymentCallbackDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'UPayments charge trackId' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PaymentCallbackDto.prototype, "trackId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Alias: TrackID (upper-case variant)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PaymentCallbackDto.prototype, "TrackID", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PaymentCallbackDto.prototype, "paymentId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'UPayments result code (CAPTURED, FAILED, …)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PaymentCallbackDto.prototype, "result", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Gateway transaction id' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PaymentCallbackDto.prototype, "tranId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Merchant reference echoed by gateway' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PaymentCallbackDto.prototype, "reference", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Auth code returned on success' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PaymentCallbackDto.prototype, "auth", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Opaque data we echoed at charge time. Contains `orderId=<uuid>`.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PaymentCallbackDto.prototype, "customerExtraData", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Internal order UUID (legacy contract)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PaymentCallbackDto.prototype, "orderId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Gateway outcome string (legacy contract)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PaymentCallbackDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Amount echoed by gateway (KWD)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PaymentCallbackDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'HMAC-SHA256 hex of `${orderId}|${status}|${amount}` with PAYMENTS_SECRET (legacy only)',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PaymentCallbackDto.prototype, "signature", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Optional gateway-side reference (legacy).',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PaymentCallbackDto.prototype, "gatewayReference", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], PaymentCallbackDto.prototype, "devMock", void 0);
//# sourceMappingURL=payment-callback.dto.js.map