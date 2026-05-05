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
exports.EXPOSURE_THRESHOLDS = exports.CashExposureResponseDto = exports.ExposureSummaryDto = exports.ExposureSilentAlertDto = exports.ExposureDriverDto = exports.ExposureBatchDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class ExposureBatchDto {
    batchId;
    amount;
    originDate;
    ageHours;
    ageBucket;
    stage;
}
exports.ExposureBatchDto = ExposureBatchDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Stable batch identifier — currently the originating order id.',
    }),
    __metadata("design:type", String)
], ExposureBatchDto.prototype, "batchId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ExposureBatchDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Asia/Kuwait YYYY-MM-DD origin day.' }),
    __metadata("design:type", String)
], ExposureBatchDto.prototype, "originDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Hours since the order was completed.' }),
    __metadata("design:type", Number)
], ExposureBatchDto.prototype, "ageHours", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ['PENDING', 'OVERDUE', 'HIGH_RISK', 'CRITICAL'],
        description: 'Aging bucket derived from `ageHours`.',
    }),
    __metadata("design:type", String)
], ExposureBatchDto.prototype, "ageBucket", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Current pipeline stage of the batch.' }),
    __metadata("design:type", String)
], ExposureBatchDto.prototype, "stage", void 0);
class ExposureDriverDto {
    driverId;
    driverName;
    branchId;
    totalExposure;
    batchCount;
    oldestPendingAgeHours;
    amountRiskLevel;
    ageRiskLevel;
    riskLevel;
    batches;
}
exports.ExposureDriverDto = ExposureDriverDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ExposureDriverDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], ExposureDriverDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], ExposureDriverDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Sum of all PENDING + OVERDUE batches for this driver (KD).',
    }),
    __metadata("design:type", String)
], ExposureDriverDto.prototype, "totalExposure", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Number of batches contributing to `totalExposure`.',
    }),
    __metadata("design:type", Number)
], ExposureDriverDto.prototype, "batchCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Hours since the driver\'s OLDEST live batch was completed. Zero when no batches.',
    }),
    __metadata("design:type", Number)
], ExposureDriverDto.prototype, "oldestPendingAgeHours", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ['NORMAL', 'WARNING', 'HIGH_RISK', 'CRITICAL'],
        description: 'Risk band from amount thresholds (≥200 KD warning, ≥500 KD critical).',
    }),
    __metadata("design:type", String)
], ExposureDriverDto.prototype, "amountRiskLevel", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ['NORMAL', 'WARNING', 'HIGH_RISK', 'CRITICAL'],
        description: 'Risk band from oldest batch age (24h/48h/72h escalation).',
    }),
    __metadata("design:type", String)
], ExposureDriverDto.prototype, "ageRiskLevel", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ['NORMAL', 'WARNING', 'HIGH_RISK', 'CRITICAL'],
        description: 'Combined risk level — the higher of `amountRiskLevel` and `ageRiskLevel`.',
    }),
    __metadata("design:type", String)
], ExposureDriverDto.prototype, "riskLevel", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [ExposureBatchDto] }),
    __metadata("design:type", Array)
], ExposureDriverDto.prototype, "batches", void 0);
class ExposureSilentAlertDto {
    type;
    level;
    driverId;
    driverName;
    branchId;
    totalExposure;
    ageHours;
    message;
    generatedAt;
}
exports.ExposureSilentAlertDto = ExposureSilentAlertDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['AMOUNT_THRESHOLD', 'AGING_THRESHOLD'] }),
    __metadata("design:type", String)
], ExposureSilentAlertDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ['WARNING', 'HIGH_RISK', 'CRITICAL'],
        description: 'Severity of this silent alert.',
    }),
    __metadata("design:type", Object)
], ExposureSilentAlertDto.prototype, "level", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ExposureSilentAlertDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], ExposureSilentAlertDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], ExposureSilentAlertDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        description: 'Total exposure when the alert was raised (KD), if amount-based.',
    }),
    __metadata("design:type", Object)
], ExposureSilentAlertDto.prototype, "totalExposure", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        description: 'Hours of the oldest batch when the alert was raised, if age-based.',
    }),
    __metadata("design:type", Object)
], ExposureSilentAlertDto.prototype, "ageHours", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Pre-localised Arabic message — already wrapped for direct rendering in the silent feed.',
    }),
    __metadata("design:type", String)
], ExposureSilentAlertDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ExposureSilentAlertDto.prototype, "generatedAt", void 0);
class ExposureSummaryDto {
    totalDrivers;
    driversAtWarning;
    driversAtHighRisk;
    driversAtCritical;
    totalExposure;
}
exports.ExposureSummaryDto = ExposureSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ExposureSummaryDto.prototype, "totalDrivers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ExposureSummaryDto.prototype, "driversAtWarning", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ExposureSummaryDto.prototype, "driversAtHighRisk", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ExposureSummaryDto.prototype, "driversAtCritical", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total cash exposure across all drivers (KD).' }),
    __metadata("design:type", String)
], ExposureSummaryDto.prototype, "totalExposure", void 0);
class CashExposureResponseDto {
    generatedAt;
    summary;
    drivers;
    silentAlerts;
    readOnly;
    advisoryOnly;
    audience;
}
exports.CashExposureResponseDto = CashExposureResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashExposureResponseDto.prototype, "generatedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: ExposureSummaryDto }),
    __metadata("design:type", ExposureSummaryDto)
], CashExposureResponseDto.prototype, "summary", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [ExposureDriverDto] }),
    __metadata("design:type", Array)
], CashExposureResponseDto.prototype, "drivers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: [ExposureSilentAlertDto],
        description: 'Silent alerts raised by the amount + aging thresholds. Visible only in accountant + executive views; never shown on the manager dashboard.',
    }),
    __metadata("design:type", Array)
], CashExposureResponseDto.prototype, "silentAlerts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Always true. The endpoint never modifies any record.',
    }),
    __metadata("design:type", Boolean)
], CashExposureResponseDto.prototype, "readOnly", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Always true. No automatic actions are taken on these alerts.',
    }),
    __metadata("design:type", Boolean)
], CashExposureResponseDto.prototype, "advisoryOnly", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Audience marker for the consumer — accountant and executive views only. Manager UIs MUST NOT render this payload.',
    }),
    __metadata("design:type", String)
], CashExposureResponseDto.prototype, "audience", void 0);
exports.EXPOSURE_THRESHOLDS = {
    amount: {
        warningKd: 200,
        criticalKd: 500,
    },
    ageHours: {
        overdue: 24,
        highRisk: 48,
        critical: 72,
    },
};
//# sourceMappingURL=cash-exposure.dto.js.map