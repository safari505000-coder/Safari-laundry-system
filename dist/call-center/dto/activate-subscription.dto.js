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
exports.ActivateSubscriptionDto = exports.SUBSCRIPTION_ACTIVATION_PAYMENT_METHODS = void 0;
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const class_validator_1 = require("class-validator");
exports.SUBSCRIPTION_ACTIVATION_PAYMENT_METHODS = [
    client_1.PosPaymentMethod.CASH,
    client_1.PosPaymentMethod.KNET,
    client_1.PosPaymentMethod.PAYMENT_LINK,
    client_1.PosPaymentMethod.ONLINE,
    client_1.PosPaymentMethod.DEBT_ON_ACCOUNT,
];
class ActivateSubscriptionDto {
    customerId;
    planId;
    autoCloseInvoices;
    paymentMethod;
}
exports.ActivateSubscriptionDto = ActivateSubscriptionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'uuid' }),
    (0, class_validator_1.IsUUID)('4'),
    __metadata("design:type", String)
], ActivateSubscriptionDto.prototype, "customerId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'uuid' }),
    (0, class_validator_1.IsUUID)('4'),
    __metadata("design:type", String)
], ActivateSubscriptionDto.prototype, "planId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ActivateSubscriptionDto.prototype, "autoCloseInvoices", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: exports.SUBSCRIPTION_ACTIVATION_PAYMENT_METHODS,
        description: 'Always required — including free (sale price = 0) plans.',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsIn)(exports.SUBSCRIPTION_ACTIVATION_PAYMENT_METHODS),
    __metadata("design:type", String)
], ActivateSubscriptionDto.prototype, "paymentMethod", void 0);
//# sourceMappingURL=activate-subscription.dto.js.map