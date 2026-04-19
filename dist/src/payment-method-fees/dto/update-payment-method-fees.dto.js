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
exports.UpdatePaymentMethodFeesDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class UpdatePaymentMethodFeesDto {
    knetFlatKd;
    knetPercentOfGross;
    knetRule;
    cardPercentOfGross;
}
exports.UpdatePaymentMethodFeesDto = UpdatePaymentMethodFeesDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 0.1, description: 'Flat KNET fee in KWD' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], UpdatePaymentMethodFeesDto.prototype, "knetFlatKd", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 0.015, description: 'KNET % of gross (e.g. 0.015 = 1.5%)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], UpdatePaymentMethodFeesDto.prototype, "knetPercentOfGross", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: client_1.KnetCommissionRule }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.KnetCommissionRule),
    __metadata("design:type", String)
], UpdatePaymentMethodFeesDto.prototype, "knetRule", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 0.025, description: 'Card / payment link % (e.g. 0.025 = 2.5%)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], UpdatePaymentMethodFeesDto.prototype, "cardPercentOfGross", void 0);
//# sourceMappingURL=update-payment-method-fees.dto.js.map