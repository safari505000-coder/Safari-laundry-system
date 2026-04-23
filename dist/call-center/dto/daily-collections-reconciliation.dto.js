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
exports.DailyCollectionsReconciliationResponseDto = exports.ReconciliationCheckDto = exports.DailyCollectionsReconciliationQueryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
class DailyCollectionsReconciliationQueryDto {
    date;
}
exports.DailyCollectionsReconciliationQueryDto = DailyCollectionsReconciliationQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: '2026-04-19',
        description: 'Kuwait-local day (YYYY-MM-DD). Omit for today. Window is always [00:00, 24:00) Kuwait.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(ISO_DATE, { message: 'date must be YYYY-MM-DD' }),
    __metadata("design:type", String)
], DailyCollectionsReconciliationQueryDto.prototype, "date", void 0);
class ReconciliationCheckDto {
    id;
    status;
    transactionHistoryKd;
    generalLedgerKd;
    deltaKd;
    note;
}
exports.ReconciliationCheckDto = ReconciliationCheckDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Machine-friendly identifier for this check (e.g. partialDebtCollected).',
    }),
    __metadata("design:type", String)
], ReconciliationCheckDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['MATCH', 'DRIFT'] }),
    __metadata("design:type", String)
], ReconciliationCheckDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Kuwait-day sum aggregated off TransactionHistory (4dp KWD string).',
        example: '0.0000',
    }),
    __metadata("design:type", String)
], ReconciliationCheckDto.prototype, "transactionHistoryKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Kuwait-day sum aggregated off GeneralLedgerEntry (4dp KWD string).',
        example: '0.0000',
    }),
    __metadata("design:type", String)
], ReconciliationCheckDto.prototype, "generalLedgerKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'generalLedgerKd − transactionHistoryKd (signed, 4dp).',
        example: '0.0000',
    }),
    __metadata("design:type", String)
], ReconciliationCheckDto.prototype, "deltaKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Short human-readable note for humans and Sentry breadcrumbs.',
    }),
    __metadata("design:type", String)
], ReconciliationCheckDto.prototype, "note", void 0);
class DailyCollectionsReconciliationResponseDto {
    dayIsoLocal;
    dayStartIso;
    dayEndIso;
    overallStatus;
    checks;
    totals;
    generatedAtIso;
}
exports.DailyCollectionsReconciliationResponseDto = DailyCollectionsReconciliationResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-04-19' }),
    __metadata("design:type", String)
], DailyCollectionsReconciliationResponseDto.prototype, "dayIsoLocal", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DailyCollectionsReconciliationResponseDto.prototype, "dayStartIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DailyCollectionsReconciliationResponseDto.prototype, "dayEndIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['MATCH', 'DRIFT'] }),
    __metadata("design:type", String)
], DailyCollectionsReconciliationResponseDto.prototype, "overallStatus", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'List of reconciliation checks; `overallStatus` is DRIFT when any one of them is DRIFT.',
        type: [ReconciliationCheckDto],
    }),
    __metadata("design:type", Array)
], DailyCollectionsReconciliationResponseDto.prototype, "checks", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Summary of what the UI tile should show: total collected + total discount per source.',
    }),
    __metadata("design:type", Object)
], DailyCollectionsReconciliationResponseDto.prototype, "totals", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DailyCollectionsReconciliationResponseDto.prototype, "generatedAtIso", void 0);
//# sourceMappingURL=daily-collections-reconciliation.dto.js.map