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
exports.DriverAmountAuditResponseDto = exports.DriverAmountAuditSummaryDto = exports.DriverAmountMismatchDto = exports.DriverAmountPresenceDto = exports.DriverAmountSnapshotDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class DriverAmountSnapshotDto {
    classified;
    risk;
    live;
    operational;
    executive;
}
exports.DriverAmountSnapshotDto = DriverAmountSnapshotDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        description: 'KD (4 decimals) on /classified.drivers[].amount, or null when absent.',
    }),
    __metadata("design:type", Object)
], DriverAmountSnapshotDto.prototype, "classified", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        description: 'KD (4 decimals) on /risk.drivers[].totalCash, or null when absent.',
    }),
    __metadata("design:type", Object)
], DriverAmountSnapshotDto.prototype, "risk", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        description: 'KD (4 decimals) on /live.driversAtRisk[].totalCash, or null when absent.',
    }),
    __metadata("design:type", Object)
], DriverAmountSnapshotDto.prototype, "live", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        description: 'KD (4 decimals) on /operational.activeDrivers[]+driversAtRisk[].totalCash, or null when absent.',
    }),
    __metadata("design:type", Object)
], DriverAmountSnapshotDto.prototype, "operational", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        description: 'KD (4 decimals) on /executive.topRisk.amount or /executive.silentAlerts.byDriver[].totalExposure, or null when absent.',
    }),
    __metadata("design:type", Object)
], DriverAmountSnapshotDto.prototype, "executive", void 0);
class DriverAmountPresenceDto {
    classified;
    risk;
    live;
    operational;
    executive;
}
exports.DriverAmountPresenceDto = DriverAmountPresenceDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], DriverAmountPresenceDto.prototype, "classified", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], DriverAmountPresenceDto.prototype, "risk", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], DriverAmountPresenceDto.prototype, "live", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], DriverAmountPresenceDto.prototype, "operational", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], DriverAmountPresenceDto.prototype, "executive", void 0);
class DriverAmountMismatchDto {
    driverId;
    driverName;
    amounts;
    presence;
    difference;
    minAmount;
    maxAmount;
    severity;
    rootCause;
    reasons;
}
exports.DriverAmountMismatchDto = DriverAmountMismatchDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DriverAmountMismatchDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], DriverAmountMismatchDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: () => DriverAmountSnapshotDto,
        description: 'Per-layer amounts (string KD, 4 decimals) — null when the driver is absent on that layer.',
    }),
    __metadata("design:type", DriverAmountSnapshotDto)
], DriverAmountMismatchDto.prototype, "amounts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: () => DriverAmountPresenceDto,
        description: 'Which layers carried the driver. False = the layer did not list this driverId.',
    }),
    __metadata("design:type", DriverAmountPresenceDto)
], DriverAmountMismatchDto.prototype, "presence", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'maxAmount - minAmount across all five layers, with missing layers treated as 0 for the math (per spec).',
    }),
    __metadata("design:type", String)
], DriverAmountMismatchDto.prototype, "difference", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Floor of the populated amounts (KD).',
    }),
    __metadata("design:type", String)
], DriverAmountMismatchDto.prototype, "minAmount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Ceiling of the populated amounts (KD).',
    }),
    __metadata("design:type", String)
], DriverAmountMismatchDto.prototype, "maxAmount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['CRITICAL', 'WARNING'] }),
    __metadata("design:type", String)
], DriverAmountMismatchDto.prototype, "severity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DriverAmountMismatchDto.prototype, "rootCause", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Human-readable reasons supporting the root cause.' }),
    __metadata("design:type", Array)
], DriverAmountMismatchDto.prototype, "reasons", void 0);
class DriverAmountAuditSummaryDto {
    totalMismatches;
    criticalDrivers;
    layersChecked;
}
exports.DriverAmountAuditSummaryDto = DriverAmountAuditSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], DriverAmountAuditSummaryDto.prototype, "totalMismatches", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Drivers where the worst delta exceeds 5 KD (financial floor).',
    }),
    __metadata("design:type", Number)
], DriverAmountAuditSummaryDto.prototype, "criticalDrivers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], DriverAmountAuditSummaryDto.prototype, "layersChecked", void 0);
class DriverAmountAuditResponseDto {
    status;
    totalDrivers;
    mismatches;
    matched;
    summary;
    generatedAt;
    readOnly;
}
exports.DriverAmountAuditResponseDto = DriverAmountAuditResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['PASS', 'FAIL'] }),
    __metadata("design:type", String)
], DriverAmountAuditResponseDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], DriverAmountAuditResponseDto.prototype, "totalDrivers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [DriverAmountMismatchDto] }),
    __metadata("design:type", Array)
], DriverAmountAuditResponseDto.prototype, "mismatches", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: [DriverAmountMismatchDto],
        description: 'Drivers whose values match across all layers — kept here for transparency / debugging.',
    }),
    __metadata("design:type", Array)
], DriverAmountAuditResponseDto.prototype, "matched", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => DriverAmountAuditSummaryDto }),
    __metadata("design:type", DriverAmountAuditSummaryDto)
], DriverAmountAuditResponseDto.prototype, "summary", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DriverAmountAuditResponseDto.prototype, "generatedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Always true — audit never writes data.' }),
    __metadata("design:type", Boolean)
], DriverAmountAuditResponseDto.prototype, "readOnly", void 0);
//# sourceMappingURL=driver-amount-audit.dto.js.map