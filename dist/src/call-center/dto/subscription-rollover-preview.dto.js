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
exports.SubscriptionRolloverPreviewDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class SubscriptionRolloverPreviewDto {
    hasPrevious;
    carriedBalanceKd;
    previousPlanName;
    previousActivatedAtIso;
    previousExpiresAtIso;
    currentWalletBalanceKd;
    currentWalletDebtKd;
}
exports.SubscriptionRolloverPreviewDto = SubscriptionRolloverPreviewDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'True when the customer has a prior subscription that will be rolled over. False for first-time activations.',
    }),
    __metadata("design:type", Boolean)
], SubscriptionRolloverPreviewDto.prototype, "hasPrevious", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Signed decimal string (4dp). Positive = prepaid balance that will carry forward; negative = debt carried forward; zero = exactly even.',
        example: '3.5000',
    }),
    __metadata("design:type", String)
], SubscriptionRolloverPreviewDto.prototype, "carriedBalanceKd", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Previous plan display name (snapshot from predecessor row).',
        example: 'Monthly Saver',
    }),
    __metadata("design:type", String)
], SubscriptionRolloverPreviewDto.prototype, "previousPlanName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'ISO timestamp of when the predecessor was last activated.',
    }),
    __metadata("design:type", String)
], SubscriptionRolloverPreviewDto.prototype, "previousActivatedAtIso", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'ISO timestamp of when the predecessor expires/expired.',
    }),
    __metadata("design:type", String)
], SubscriptionRolloverPreviewDto.prototype, "previousExpiresAtIso", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Current wallet prepaid balance at preview time (may drift until activate is called).',
        example: '5.0000',
    }),
    __metadata("design:type", String)
], SubscriptionRolloverPreviewDto.prototype, "currentWalletBalanceKd", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Current wallet debt at preview time.',
        example: '1.5000',
    }),
    __metadata("design:type", String)
], SubscriptionRolloverPreviewDto.prototype, "currentWalletDebtKd", void 0);
//# sourceMappingURL=subscription-rollover-preview.dto.js.map