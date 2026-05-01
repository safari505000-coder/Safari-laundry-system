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
exports.DebtConversionOptionsResponseDto = exports.DebtConversionPlanOptionDto = exports.DebtKdBreakdownTraceDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class DebtKdBreakdownTraceDto {
    ledgerNetKd;
    walletSnapshotKd;
    orderMarketScopeKd;
    effectiveDebtKd;
    winningSources;
}
exports.DebtKdBreakdownTraceDto = DebtKdBreakdownTraceDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '12.7000' }),
    __metadata("design:type", String)
], DebtKdBreakdownTraceDto.prototype, "ledgerNetKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '34.4500' }),
    __metadata("design:type", String)
], DebtKdBreakdownTraceDto.prototype, "walletSnapshotKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '34.4500' }),
    __metadata("design:type", String)
], DebtKdBreakdownTraceDto.prototype, "orderMarketScopeKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '34.4500' }),
    __metadata("design:type", String)
], DebtKdBreakdownTraceDto.prototype, "effectiveDebtKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: ['walletSnapshot', 'orderMarket'],
        description: 'Which baseline(s) matched effective (ties possible). Values: ledger | walletSnapshot | orderMarket.',
        type: [String],
    }),
    __metadata("design:type", Array)
], DebtKdBreakdownTraceDto.prototype, "winningSources", void 0);
class DebtConversionPlanOptionDto {
    planId;
    planName;
    planValidityDays;
    cashRequiredKd;
    planActualBalanceKd;
    debtToSettleKd;
    remainingDebtKd;
    creditedToBalanceKd;
    projectedWalletBalanceKd;
    projectedWalletDebtKd;
    subsidyKd;
    convertsDebt;
    clearsAllDebt;
    recommended;
}
exports.DebtConversionPlanOptionDto = DebtConversionPlanOptionDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DebtConversionPlanOptionDto.prototype, "planId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DebtConversionPlanOptionDto.prototype, "planName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], DebtConversionPlanOptionDto.prototype, "planValidityDays", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '5.0000' }),
    __metadata("design:type", String)
], DebtConversionPlanOptionDto.prototype, "cashRequiredKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '6.0000' }),
    __metadata("design:type", String)
], DebtConversionPlanOptionDto.prototype, "planActualBalanceKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '3.0000' }),
    __metadata("design:type", String)
], DebtConversionPlanOptionDto.prototype, "debtToSettleKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '0.0000' }),
    __metadata("design:type", String)
], DebtConversionPlanOptionDto.prototype, "remainingDebtKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '3.0000' }),
    __metadata("design:type", String)
], DebtConversionPlanOptionDto.prototype, "creditedToBalanceKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '3.0000' }),
    __metadata("design:type", String)
], DebtConversionPlanOptionDto.prototype, "projectedWalletBalanceKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '0.0000' }),
    __metadata("design:type", String)
], DebtConversionPlanOptionDto.prototype, "projectedWalletDebtKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '1.0000' }),
    __metadata("design:type", String)
], DebtConversionPlanOptionDto.prototype, "subsidyKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], DebtConversionPlanOptionDto.prototype, "convertsDebt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], DebtConversionPlanOptionDto.prototype, "clearsAllDebt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], DebtConversionPlanOptionDto.prototype, "recommended", void 0);
class DebtConversionOptionsResponseDto {
    customerId;
    currentDebtKd;
    currentBalanceKd;
    hasDebt;
    debtKdBreakdownTrace;
    options;
}
exports.DebtConversionOptionsResponseDto = DebtConversionOptionsResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DebtConversionOptionsResponseDto.prototype, "customerId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '3.0000' }),
    __metadata("design:type", String)
], DebtConversionOptionsResponseDto.prototype, "currentDebtKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '0.0000' }),
    __metadata("design:type", String)
], DebtConversionOptionsResponseDto.prototype, "currentBalanceKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Convenience flag so the UI can hide the "Convert debt" CTA when the customer has no outstanding debt to convert.',
    }),
    __metadata("design:type", Boolean)
], DebtConversionOptionsResponseDto.prototype, "hasDebt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        type: DebtKdBreakdownTraceDto,
        description: 'Included when server env EXPOSE_DEBT_BREAKDOWN=1 — three candidate totals + winners.',
    }),
    __metadata("design:type", DebtKdBreakdownTraceDto)
], DebtConversionOptionsResponseDto.prototype, "debtKdBreakdownTrace", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [DebtConversionPlanOptionDto] }),
    __metadata("design:type", Array)
], DebtConversionOptionsResponseDto.prototype, "options", void 0);
//# sourceMappingURL=debt-conversion-options.dto.js.map