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
exports.CashMonitorLiveDto = exports.MonitorSummaryDto = exports.MonitorLocationSummaryDto = exports.MonitorDriverExposureDto = exports.MonitorAlertDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class MonitorAlertDto {
    type;
    severity;
    driverId;
    driverName;
    branchId;
    amount;
    message;
    timestamp;
    countdownMinutes;
    isPrediction;
    dedupKey;
}
exports.MonitorAlertDto = MonitorAlertDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], MonitorAlertDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['INFO', 'WARNING', 'CRITICAL'] }),
    __metadata("design:type", String)
], MonitorAlertDto.prototype, "severity", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], MonitorAlertDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], MonitorAlertDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], MonitorAlertDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], MonitorAlertDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], MonitorAlertDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ISO timestamp when this alert was first emitted.' }),
    __metadata("design:type", String)
], MonitorAlertDto.prototype, "timestamp", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        description: 'Minutes remaining before the underlying threshold is breached. Set on PRE_SHIFT_OVERDUE only; null otherwise.',
    }),
    __metadata("design:type", Object)
], MonitorAlertDto.prototype, "countdownMinutes", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'True for predictive alerts (R06 PRE_SHIFT_OVERDUE) — surfaces a possible future violation, not a current one.',
    }),
    __metadata("design:type", Boolean)
], MonitorAlertDto.prototype, "isPrediction", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, description: 'Stable dedup key.' }),
    __metadata("design:type", Object)
], MonitorAlertDto.prototype, "dedupKey", void 0);
class MonitorDriverExposureDto {
    driverId;
    driverName;
    branchId;
    totalCash;
    flowsCount;
    shiftStatus;
    shiftDurationHours;
    countdownMinutes;
}
exports.MonitorDriverExposureDto = MonitorDriverExposureDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], MonitorDriverExposureDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], MonitorDriverExposureDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], MonitorDriverExposureDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total live cash currently attributable to this driver (KD).' }),
    __metadata("design:type", String)
], MonitorDriverExposureDto.prototype, "totalCash", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of live flows associated with the driver.' }),
    __metadata("design:type", Number)
], MonitorDriverExposureDto.prototype, "flowsCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], MonitorDriverExposureDto.prototype, "shiftStatus", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], MonitorDriverExposureDto.prototype, "shiftDurationHours", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        description: 'Minutes until SHIFT_OVERDUE for the open shift; null when shift is closed.',
    }),
    __metadata("design:type", Object)
], MonitorDriverExposureDto.prototype, "countdownMinutes", void 0);
class MonitorLocationSummaryDto {
    DRIVER;
    CUSTODY;
    BANK;
}
exports.MonitorLocationSummaryDto = MonitorLocationSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], MonitorLocationSummaryDto.prototype, "DRIVER", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], MonitorLocationSummaryDto.prototype, "CUSTODY", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], MonitorLocationSummaryDto.prototype, "BANK", void 0);
class MonitorSummaryDto {
    totalCash;
    driversAtRisk;
    activeAnomalies;
    openShifts;
}
exports.MonitorSummaryDto = MonitorSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], MonitorSummaryDto.prototype, "totalCash", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], MonitorSummaryDto.prototype, "driversAtRisk", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], MonitorSummaryDto.prototype, "activeAnomalies", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], MonitorSummaryDto.prototype, "openShifts", void 0);
class CashMonitorLiveDto {
    timestamp;
    lastPollAt;
    lastPollAgeSeconds;
    realtimeStatus;
    activeDrivers;
    preRisk;
    alerts;
    driversAtRisk;
    locationSummary;
    summary;
    readOnly;
    advisoryOnly;
}
exports.CashMonitorLiveDto = CashMonitorLiveDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ISO timestamp when this snapshot was assembled.' }),
    __metadata("design:type", String)
], CashMonitorLiveDto.prototype, "timestamp", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ISO timestamp of the latest underlying analysis poll.' }),
    __metadata("design:type", Object)
], CashMonitorLiveDto.prototype, "lastPollAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Time since the last successful poll (seconds).' }),
    __metadata("design:type", Object)
], CashMonitorLiveDto.prototype, "lastPollAgeSeconds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['GREEN', 'YELLOW', 'RED'] }),
    __metadata("design:type", String)
], CashMonitorLiveDto.prototype, "realtimeStatus", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], CashMonitorLiveDto.prototype, "activeDrivers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [MonitorAlertDto] }),
    __metadata("design:type", Array)
], CashMonitorLiveDto.prototype, "preRisk", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [MonitorAlertDto] }),
    __metadata("design:type", Array)
], CashMonitorLiveDto.prototype, "alerts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [MonitorDriverExposureDto] }),
    __metadata("design:type", Array)
], CashMonitorLiveDto.prototype, "driversAtRisk", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", MonitorLocationSummaryDto)
], CashMonitorLiveDto.prototype, "locationSummary", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", MonitorSummaryDto)
], CashMonitorLiveDto.prototype, "summary", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Always true — this layer never modifies data.' }),
    __metadata("design:type", Boolean)
], CashMonitorLiveDto.prototype, "readOnly", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Always true — alerts are advisory; no auto-actions.' }),
    __metadata("design:type", Boolean)
], CashMonitorLiveDto.prototype, "advisoryOnly", void 0);
//# sourceMappingURL=cash-monitor.dto.js.map