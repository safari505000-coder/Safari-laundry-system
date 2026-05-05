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
exports.OperationalLiveDto = exports.OperationalSummaryDto = exports.OperationalHiddenDto = exports.OperationalAlertDto = exports.ActiveDriverDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class ActiveDriverDto {
    driverId;
    driverName;
    branchId;
    ordersTodayCount;
    collectedCashToday;
    totalCash;
    lastCashActivityDate;
    shiftStatus;
    shiftDurationHours;
    countdownMinutes;
    status;
}
exports.ActiveDriverDto = ActiveDriverDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ActiveDriverDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], ActiveDriverDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], ActiveDriverDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of CASH orders the driver completed today (Asia/Kuwait day).' }),
    __metadata("design:type", Number)
], ActiveDriverDto.prototype, "ordersTodayCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'KD collected today (sum of completed CASH order totals).' }),
    __metadata("design:type", String)
], ActiveDriverDto.prototype, "collectedCashToday", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Total live cash currently attributable to the driver (KD), regardless of origin date.',
    }),
    __metadata("design:type", String)
], ActiveDriverDto.prototype, "totalCash", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        description: 'Most recent origin date among any of the driver\'s live flows (YYYY-MM-DD).',
    }),
    __metadata("design:type", Object)
], ActiveDriverDto.prototype, "lastCashActivityDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['OPEN', 'CLOSED', 'NO_SHIFT'] }),
    __metadata("design:type", String)
], ActiveDriverDto.prototype, "shiftStatus", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], ActiveDriverDto.prototype, "shiftDurationHours", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        description: 'Minutes until the SHIFT_OVERDUE cap (16h) is breached; null when shift is closed or already overdue.',
    }),
    __metadata("design:type", Object)
], ActiveDriverDto.prototype, "countdownMinutes", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ['ACTIVE', 'AT_RISK', 'EXPOSURE_ONLY', 'STALE'],
        description: 'Operational classification used by the filter. STALE rows are excluded from the displayed lists; the count is reported in `hidden`.',
    }),
    __metadata("design:type", String)
], ActiveDriverDto.prototype, "status", void 0);
class OperationalAlertDto {
    type;
    domain;
    severity;
    driverId;
    driverName;
    branchId;
    amount;
    message;
    timestamp;
    countdownMinutes;
    isPrediction;
    originalType;
}
exports.OperationalAlertDto = OperationalAlertDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OperationalAlertDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ['FINANCIAL', 'COMPLIANCE'],
        description: 'Authoritative domain from the classifier (single source of truth). Operational layer never decides this — it inherits.',
    }),
    __metadata("design:type", String)
], OperationalAlertDto.prototype, "domain", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ['INFO', 'WARNING', 'CRITICAL'],
        description: 'Authoritative severity from the classifier. Operational layer never increases nor decreases — it inherits.',
    }),
    __metadata("design:type", String)
], OperationalAlertDto.prototype, "severity", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], OperationalAlertDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], OperationalAlertDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], OperationalAlertDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OperationalAlertDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OperationalAlertDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OperationalAlertDto.prototype, "timestamp", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], OperationalAlertDto.prototype, "countdownMinutes", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], OperationalAlertDto.prototype, "isPrediction", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        description: 'When R08 reclassification was applied, this carries the original alert type so the audit trail is preserved.',
    }),
    __metadata("design:type", Object)
], OperationalAlertDto.prototype, "originalType", void 0);
class OperationalHiddenDto {
    staleDriversCount;
    excludedAlertCount;
    note;
}
exports.OperationalHiddenDto = OperationalHiddenDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], OperationalHiddenDto.prototype, "staleDriversCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Number of underlying alerts removed from the `alerts` list because they fired on a STALE shift with zero financial exposure.',
    }),
    __metadata("design:type", Number)
], OperationalHiddenDto.prototype, "excludedAlertCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OperationalHiddenDto.prototype, "note", void 0);
class OperationalSummaryDto {
    totalDriversShown;
    totalCash;
    driversAtRisk;
    activeAlerts;
}
exports.OperationalSummaryDto = OperationalSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'totalDriversShown — counts ACTIVE + AT_RISK + EXPOSURE_ONLY rows.' }),
    __metadata("design:type", Number)
], OperationalSummaryDto.prototype, "totalDriversShown", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total live cash on shown drivers (KD).' }),
    __metadata("design:type", String)
], OperationalSummaryDto.prototype, "totalCash", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Drivers in AT_RISK or EXPOSURE_ONLY classifications.' }),
    __metadata("design:type", Number)
], OperationalSummaryDto.prototype, "driversAtRisk", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], OperationalSummaryDto.prototype, "activeAlerts", void 0);
class OperationalLiveDto {
    timestamp;
    realtimeStatus;
    activeDrivers;
    driversAtRisk;
    alerts;
    hidden;
    summary;
    readOnly;
    advisoryOnly;
}
exports.OperationalLiveDto = OperationalLiveDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OperationalLiveDto.prototype, "timestamp", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['GREEN', 'YELLOW', 'RED'] }),
    __metadata("design:type", String)
], OperationalLiveDto.prototype, "realtimeStatus", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [ActiveDriverDto] }),
    __metadata("design:type", Array)
], OperationalLiveDto.prototype, "activeDrivers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [ActiveDriverDto] }),
    __metadata("design:type", Array)
], OperationalLiveDto.prototype, "driversAtRisk", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [OperationalAlertDto] }),
    __metadata("design:type", Array)
], OperationalLiveDto.prototype, "alerts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", OperationalHiddenDto)
], OperationalLiveDto.prototype, "hidden", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", OperationalSummaryDto)
], OperationalLiveDto.prototype, "summary", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Always true. No data was modified by this view.' }),
    __metadata("design:type", Boolean)
], OperationalLiveDto.prototype, "readOnly", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Always true. The view is advisory; downstream systems must not auto-apply penalties.' }),
    __metadata("design:type", Boolean)
], OperationalLiveDto.prototype, "advisoryOnly", void 0);
//# sourceMappingURL=cash-monitor-operational.dto.js.map