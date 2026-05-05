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
exports.CashRiskResponseDto = exports.CashRiskExecutionExplanationDto = exports.CashRiskSummaryDto = exports.CashRiskAnomalyDto = exports.CashRiskDriverDto = exports.CashRiskBreakdownDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class CashRiskBreakdownDto {
    amount;
    ageDays;
    ageHours;
    score;
    classification;
    stage;
}
exports.CashRiskBreakdownDto = CashRiskBreakdownDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'KD (4 decimals).' }),
    __metadata("design:type", String)
], CashRiskBreakdownDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'floor(ageHours / 24).' }),
    __metadata("design:type", Number)
], CashRiskBreakdownDto.prototype, "ageDays", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Sub-day age. Drives the 24h grace gate.' }),
    __metadata("design:type", Number)
], CashRiskBreakdownDto.prototype, "ageHours", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'amount × ageDays × amountMultiplier × behaviorMultiplier; 0 within grace.' }),
    __metadata("design:type", Number)
], CashRiskBreakdownDto.prototype, "score", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['NEW_CASH', 'AGED', 'SHIFT_COMPLIANCE_ONLY'] }),
    __metadata("design:type", String)
], CashRiskBreakdownDto.prototype, "classification", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['DRIVER', 'DRIVER_HANDOVER', 'CUSTODY', 'VERIFIED', 'DEPOSIT', 'BANK'] }),
    __metadata("design:type", String)
], CashRiskBreakdownDto.prototype, "stage", void 0);
class CashRiskDriverDto {
    driverId;
    driverName;
    branchId;
    totalCash;
    driverScore;
    status;
    breakdown;
    lateCountLast7Days;
    behaviorMultiplier;
    shiftDurationHours;
    shiftComplianceOnly;
    action;
    responsible;
}
exports.CashRiskDriverDto = CashRiskDriverDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashRiskDriverDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], CashRiskDriverDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], CashRiskDriverDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Sum of aged + new cash currently with this driver (KD, 4 decimals).' }),
    __metadata("design:type", String)
], CashRiskDriverDto.prototype, "totalCash", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Σ finalScore across all aged units (excludes units in 24h grace).' }),
    __metadata("design:type", Number)
], CashRiskDriverDto.prototype, "driverScore", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['NORMAL', 'WARNING', 'RISK', 'CRITICAL'] }),
    __metadata("design:type", String)
], CashRiskDriverDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Per-unit breakdown — full transparency. Includes units in grace (score=0, classification=NEW_CASH).',
        type: () => CashRiskBreakdownDto,
        isArray: true,
    }),
    __metadata("design:type", Array)
], CashRiskDriverDto.prototype, "breakdown", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Late-count proxy: times entered the at-risk set in the last 7 days.' }),
    __metadata("design:type", Number)
], CashRiskDriverDto.prototype, "lateCountLast7Days", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Behaviour multiplier applied (1.0 or 1.5).' }),
    __metadata("design:type", Number)
], CashRiskDriverDto.prototype, "behaviorMultiplier", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, description: 'Open shift duration (hours). Null when no open shift.' }),
    __metadata("design:type", Object)
], CashRiskDriverDto.prototype, "shiftDurationHours", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'True when status was capped at WARNING because shift > 16h but ALL cash < 24h. Step 9.',
    }),
    __metadata("design:type", Boolean)
], CashRiskDriverDto.prototype, "shiftComplianceOnly", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Recommended next action (advisory only).' }),
    __metadata("design:type", String)
], CashRiskDriverDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        enum: ['DRIVER', 'BRANCH_MANAGER', 'ACCOUNTANT', 'SYSTEM', null],
        description: 'Set ONLY when a real anomaly exists. Step 11.',
    }),
    __metadata("design:type", Object)
], CashRiskDriverDto.prototype, "responsible", void 0);
class CashRiskAnomalyDto {
    type;
    driverId;
    driverName;
    branchId;
    amount;
    ageDays;
    ageHours;
    responsible;
    reason;
}
exports.CashRiskAnomalyDto = CashRiskAnomalyDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashRiskAnomalyDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashRiskAnomalyDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], CashRiskAnomalyDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], CashRiskAnomalyDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashRiskAnomalyDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], CashRiskAnomalyDto.prototype, "ageDays", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], CashRiskAnomalyDto.prototype, "ageHours", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashRiskAnomalyDto.prototype, "responsible", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashRiskAnomalyDto.prototype, "reason", void 0);
class CashRiskSummaryDto {
    totalCash;
    totalDrivers;
    driversAtRisk;
    agedCash;
    newCash;
}
exports.CashRiskSummaryDto = CashRiskSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashRiskSummaryDto.prototype, "totalCash", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], CashRiskSummaryDto.prototype, "totalDrivers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], CashRiskSummaryDto.prototype, "driversAtRisk", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Cash that crossed the 24h grace gate (KD, 4 decimals).' }),
    __metadata("design:type", String)
], CashRiskSummaryDto.prototype, "agedCash", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Cash inside the 24h grace gate (KD, 4 decimals).' }),
    __metadata("design:type", String)
], CashRiskSummaryDto.prototype, "newCash", void 0);
class CashRiskExecutionExplanationDto {
    gracePeriodHours;
    severityBands;
    amountTiers;
    shiftOverdueCapHours;
    generatedAt;
}
exports.CashRiskExecutionExplanationDto = CashRiskExecutionExplanationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Grace gate, in hours. Always 24 per spec.' }),
    __metadata("design:type", Number)
], CashRiskExecutionExplanationDto.prototype, "gracePeriodHours", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Severity bands { NORMAL, WARNING, RISK, CRITICAL } as min thresholds.' }),
    __metadata("design:type", Object)
], CashRiskExecutionExplanationDto.prototype, "severityBands", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Amount tier cuts (KD).' }),
    __metadata("design:type", Object)
], CashRiskExecutionExplanationDto.prototype, "amountTiers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Shift overdue cap (hours).' }),
    __metadata("design:type", Number)
], CashRiskExecutionExplanationDto.prototype, "shiftOverdueCapHours", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashRiskExecutionExplanationDto.prototype, "generatedAt", void 0);
class CashRiskResponseDto {
    systemStatus;
    summary;
    drivers;
    anomalies;
    executionSummary;
    readOnly;
    advisoryOnly;
}
exports.CashRiskResponseDto = CashRiskResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['GREEN', 'YELLOW', 'RED'] }),
    __metadata("design:type", String)
], CashRiskResponseDto.prototype, "systemStatus", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", CashRiskSummaryDto)
], CashRiskResponseDto.prototype, "summary", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => CashRiskDriverDto, isArray: true }),
    __metadata("design:type", Array)
], CashRiskResponseDto.prototype, "drivers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => CashRiskAnomalyDto, isArray: true }),
    __metadata("design:type", Array)
], CashRiskResponseDto.prototype, "anomalies", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", CashRiskExecutionExplanationDto)
], CashRiskResponseDto.prototype, "executionSummary", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], CashRiskResponseDto.prototype, "readOnly", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], CashRiskResponseDto.prototype, "advisoryOnly", void 0);
//# sourceMappingURL=cash-risk.dto.js.map