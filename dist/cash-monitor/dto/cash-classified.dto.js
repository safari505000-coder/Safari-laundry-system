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
exports.CashClassifiedResponseDto = exports.ClassifiedRulesDto = exports.ClassifiedDriverDto = exports.ClassifiedAlertDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class ClassifiedAlertDto {
    domain;
    type;
    severity;
    driverId;
    driverName;
    branchId;
    amount;
    cashAgeHours;
    reason;
    originalType;
}
exports.ClassifiedAlertDto = ClassifiedAlertDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['FINANCIAL', 'COMPLIANCE'] }),
    __metadata("design:type", String)
], ClassifiedAlertDto.prototype, "domain", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Final post-classification type. e.g. SHIFT_COMPLIANCE_ONLY (compliance) vs DEPOSIT_NOT_REGISTERED (financial).',
    }),
    __metadata("design:type", String)
], ClassifiedAlertDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['INFO', 'WARNING', 'CRITICAL'] }),
    __metadata("design:type", String)
], ClassifiedAlertDto.prototype, "severity", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], ClassifiedAlertDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], ClassifiedAlertDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], ClassifiedAlertDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'KD, 4 decimals.' }),
    __metadata("design:type", String)
], ClassifiedAlertDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Sub-day cash age (hours).' }),
    __metadata("design:type", Number)
], ClassifiedAlertDto.prototype, "cashAgeHours", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ClassifiedAlertDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        description: 'Original v2 type before classification (audit trail).',
    }),
    __metadata("design:type", Object)
], ClassifiedAlertDto.prototype, "originalType", void 0);
class ClassifiedDriverDto {
    driverId;
    driverName;
    branchId;
    holderRole;
    status;
    cashAgeHours;
    amount;
    shiftDurationHours;
    note;
}
exports.ClassifiedDriverDto = ClassifiedDriverDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ClassifiedDriverDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], ClassifiedDriverDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], ClassifiedDriverDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        description: "Role of the cash holder (DRIVER, MANAGER, OWNER, …). Lets dashboards separate driver custody from manager-held cash without re-querying the user table.",
    }),
    __metadata("design:type", Object)
], ClassifiedDriverDto.prototype, "holderRole", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['NORMAL', 'COMPLIANCE_ONLY', 'AT_RISK'] }),
    __metadata("design:type", String)
], ClassifiedDriverDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Sub-day age of the driver\'s OLDEST live cash unit, hours.' }),
    __metadata("design:type", Number)
], ClassifiedDriverDto.prototype, "cashAgeHours", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total live cash on this driver (KD, 4 decimals).' }),
    __metadata("design:type", String)
], ClassifiedDriverDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, description: 'Open shift duration in hours, when shift is open.' }),
    __metadata("design:type", Object)
], ClassifiedDriverDto.prototype, "shiftDurationHours", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Human-readable note explaining the status decision.' }),
    __metadata("design:type", String)
], ClassifiedDriverDto.prototype, "note", void 0);
class ClassifiedRulesDto {
    gracePeriodHours;
    smallAmountFloorKd;
    financialChainTypes;
    complianceTypes;
    shiftFinancialSeverityCap;
    generatedAt;
}
exports.ClassifiedRulesDto = ClassifiedRulesDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ClassifiedRulesDto.prototype, "gracePeriodHours", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Minimum amount (KD) required to ever cross WARNING.' }),
    __metadata("design:type", Number)
], ClassifiedRulesDto.prototype, "smallAmountFloorKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Anomaly types treated as FINANCIAL chain breaks.' }),
    __metadata("design:type", Array)
], ClassifiedRulesDto.prototype, "financialChainTypes", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Anomaly types treated as OPERATIONAL compliance.' }),
    __metadata("design:type", Array)
], ClassifiedRulesDto.prototype, "complianceTypes", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Cap applied to SHIFT_OVERDUE_FINANCIAL severity.' }),
    __metadata("design:type", String)
], ClassifiedRulesDto.prototype, "shiftFinancialSeverityCap", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ClassifiedRulesDto.prototype, "generatedAt", void 0);
class CashClassifiedResponseDto {
    systemStatus;
    financialAlerts;
    complianceAlerts;
    drivers;
    finalDecision;
    rules;
    readOnly;
    advisoryOnly;
}
exports.CashClassifiedResponseDto = CashClassifiedResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['GREEN', 'YELLOW', 'RED'] }),
    __metadata("design:type", String)
], CashClassifiedResponseDto.prototype, "systemStatus", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Alerts that justify dashboard escalation (R/Y/G) — money risk only.',
        type: () => ClassifiedAlertDto,
        isArray: true,
    }),
    __metadata("design:type", Array)
], CashClassifiedResponseDto.prototype, "financialAlerts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Display-only alerts. Do NOT escalate dashboard color. Operations team should action them but treasury is not at risk.',
        type: () => ClassifiedAlertDto,
        isArray: true,
    }),
    __metadata("design:type", Array)
], CashClassifiedResponseDto.prototype, "complianceAlerts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => ClassifiedDriverDto, isArray: true }),
    __metadata("design:type", Array)
], CashClassifiedResponseDto.prototype, "drivers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'One-line decision summary for the operator.' }),
    __metadata("design:type", String)
], CashClassifiedResponseDto.prototype, "finalDecision", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Rule snapshot — the engine documents the cuts it actually applied.' }),
    __metadata("design:type", ClassifiedRulesDto)
], CashClassifiedResponseDto.prototype, "rules", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], CashClassifiedResponseDto.prototype, "readOnly", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], CashClassifiedResponseDto.prototype, "advisoryOnly", void 0);
//# sourceMappingURL=cash-classified.dto.js.map