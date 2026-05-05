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
exports.CashExplainResponseDto = exports.CashExplainDriverDto = exports.CashExplainBreakdownEntryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class CashExplainBreakdownEntryDto {
    date;
    amount;
    count;
}
exports.CashExplainBreakdownEntryDto = CashExplainBreakdownEntryDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Kuwait local date the cash originated (YYYY-MM-DD).',
        example: '2026-05-01',
    }),
    __metadata("design:type", String)
], CashExplainBreakdownEntryDto.prototype, "date", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Sum of cash amounts (KD, fixed-4) recorded on this date for this driver. Same units as `/classified.drivers[].amount`.',
        example: '60.0000',
    }),
    __metadata("design:type", String)
], CashExplainBreakdownEntryDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Number of distinct cash flows aggregated into this date bucket.',
        example: 3,
    }),
    __metadata("design:type", Number)
], CashExplainBreakdownEntryDto.prototype, "count", void 0);
class CashExplainDriverDto {
    driverId;
    driverName;
    branchId;
    totalCash;
    oldestCashAgeHours;
    oldestOriginDate;
    flowCount;
    breakdown;
}
exports.CashExplainDriverDto = CashExplainDriverDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashExplainDriverDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], CashExplainDriverDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], CashExplainDriverDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Total live cash held by this driver across all open dates (KD, fixed-4). Sums to `breakdown[].amount`.',
        example: '111.0000',
    }),
    __metadata("design:type", String)
], CashExplainDriverDto.prototype, "totalCash", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Age in hours of the OLDEST flow this driver still holds (rounded to 2 decimals). 0 when the driver has no live cash.',
        example: 50.5,
    }),
    __metadata("design:type", Number)
], CashExplainDriverDto.prototype, "oldestCashAgeHours", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        description: 'Earliest origin date (Kuwait YYYY-MM-DD) across this driver\'s flows, or null when the driver has no live cash.',
    }),
    __metadata("design:type", Object)
], CashExplainDriverDto.prototype, "oldestOriginDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total number of underlying cash flows.' }),
    __metadata("design:type", Number)
], CashExplainDriverDto.prototype, "flowCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: [CashExplainBreakdownEntryDto],
        description: 'Per-day breakdown sorted oldest → newest. Together the entries reconcile to `totalCash`.',
    }),
    __metadata("design:type", Array)
], CashExplainDriverDto.prototype, "breakdown", void 0);
class CashExplainResponseDto {
    generatedAt;
    totalDrivers;
    totalCash;
    drivers;
    readOnly;
    advisoryOnly;
}
exports.CashExplainResponseDto = CashExplainResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ISO timestamp when the projection ran.' }),
    __metadata("design:type", String)
], CashExplainResponseDto.prototype, "generatedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of drivers with at least one live flow.' }),
    __metadata("design:type", Number)
], CashExplainResponseDto.prototype, "totalDrivers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Sum of every live flow across every driver in the (scoped) view, KD fixed-4.',
        example: '275.4000',
    }),
    __metadata("design:type", String)
], CashExplainResponseDto.prototype, "totalCash", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [CashExplainDriverDto] }),
    __metadata("design:type", Array)
], CashExplainResponseDto.prototype, "drivers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Hard contract marker — this endpoint never mutates anything, ever.',
    }),
    __metadata("design:type", Boolean)
], CashExplainResponseDto.prototype, "readOnly", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Hard contract marker — this layer is descriptive only; it has no opinions on severity, aging, or risk.',
    }),
    __metadata("design:type", Boolean)
], CashExplainResponseDto.prototype, "advisoryOnly", void 0);
//# sourceMappingURL=cash-explain.dto.js.map