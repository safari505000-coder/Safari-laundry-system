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
    debtRecoveredTodayKd;
    pendingLinksCount;
    dayIso;
    branchId;
}
exports.CallCenterOperationsSummaryDto = CallCenterOperationsSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'V1.6.5 / V20.x — Sum of `order.totalPrice` for `cashStatus=UNPAID` and not canceled, same `branchId` OR as the collections list (not full DebtLedger: excludes subscription overuse, etc.). Matches Σ table rows when the search box is empty.',
        example: '1234.560',
    }),
    __metadata("design:type", String)
], CallCenterOperationsSummaryDto.prototype, "totalMarketDebtKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'V1.6.5 — Sum of `metadata.debtSettled` across ORDER_WALLET_SETTLEMENT rows tagged `debtSettlementViaLink: true`, created strictly between Kuwait-local 00:00 today and now. Resets at 00:00 Kuwait time. Scoped by `branchId` when provided. Serialized in KWD 3-decimal precision.',
        example: '80.000',
    }),
    __metadata("design:type", String)
], CallCenterOperationsSummaryDto.prototype, "debtCollectedTodayKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'A3.D10 — Broad "debt recovered today" metric matching the Owner Debt Recovery Report formula: sum of `metadata.debtSettled` across both ORDER_WALLET_SETTLEMENT (via link + manual call-center + driver checkout shortfall) and SUBSCRIPTION_ACTIVATION rows, today (Kuwait local). This is the value the Owner report sums per day; exposed here so both surfaces can display identical numbers for the same window.',
        example: '95.000',
    }),
    __metadata("design:type", String)
], CallCenterOperationsSummaryDto.prototype, "debtRecoveredTodayKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Count of open (non-canceled, UNPAID) orders that have a stored hosted payment URL waiting for customer action. Scoped by `branchId` when provided.',
        example: 12,
    }),
    __metadata("design:type", Number)
], CallCenterOperationsSummaryDto.prototype, "pendingLinksCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Reference day in Asia/Kuwait (UTC+3) local timezone, ISO YYYY-MM-DD.',
        example: '2026-04-18',
    }),
    __metadata("design:type", String)
], CallCenterOperationsSummaryDto.prototype, "dayIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'V1.6.1 — echoed branch filter (`null` means "All Branches"). Clients use this to confirm the selection the aggregate was computed for.',
        example: null,
        required: false,
        nullable: true,
        type: String,
    }),
    __metadata("design:type", Object)
], CallCenterOperationsSummaryDto.prototype, "branchId", void 0);
//# sourceMappingURL=operations-summary.dto.js.map