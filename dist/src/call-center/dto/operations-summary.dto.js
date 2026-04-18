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
exports.CallCenterOperationsSummaryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class CallCenterOperationsSummaryDto {
    totalMarketDebtKd;
    debtCollectedTodayKd;
    pendingLinksCount;
    dayIso;
}
exports.CallCenterOperationsSummaryDto = CallCenterOperationsSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Sum of CustomerWallet.debt across all customers (KWD, 4 decimals).',
        example: '1234.5600',
    }),
    __metadata("design:type", String)
], CallCenterOperationsSummaryDto.prototype, "totalMarketDebtKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Sum of debtSettled metadata across ORDER_WALLET_SETTLEMENT + SUBSCRIPTION_ACTIVATION transactions created today (UTC day).',
        example: '80.0000',
    }),
    __metadata("design:type", String)
], CallCenterOperationsSummaryDto.prototype, "debtCollectedTodayKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Count of open (non-canceled, UNPAID) orders that have a stored hosted payment URL waiting for customer action.',
        example: 12,
    }),
    __metadata("design:type", Number)
], CallCenterOperationsSummaryDto.prototype, "pendingLinksCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Reference day (UTC ISO date, YYYY-MM-DD).',
        example: '2026-04-18',
    }),
    __metadata("design:type", String)
], CallCenterOperationsSummaryDto.prototype, "dayIso", void 0);
//# sourceMappingURL=operations-summary.dto.js.map