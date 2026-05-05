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
exports.CashExecutiveResponseDto = exports.ExecutiveAuditReferenceDto = exports.ExecutiveSummaryDto = exports.ExecutiveActionDto = exports.ExecutiveTopRiskDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const cash_execution_dto_1 = require("./cash-execution.dto");
const cash_exposure_dto_1 = require("./cash-exposure.dto");
class ExecutiveTopRiskDto {
    driverId;
    driverName;
    branchId;
    amount;
    issue;
    action;
    urgency;
    responsible;
    recommendedSteps;
    alertType;
    execution;
}
exports.ExecutiveTopRiskDto = ExecutiveTopRiskDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], ExecutiveTopRiskDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], ExecutiveTopRiskDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], ExecutiveTopRiskDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ExecutiveTopRiskDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Operator-friendly explanation of the risk.' }),
    __metadata("design:type", String)
], ExecutiveTopRiskDto.prototype, "issue", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Recommended verb (e.g. CONTACT_DRIVER_IMMEDIATELY).' }),
    __metadata("design:type", String)
], ExecutiveTopRiskDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['HIGH', 'MEDIUM', 'LOW'] }),
    __metadata("design:type", String)
], ExecutiveTopRiskDto.prototype, "urgency", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ['DRIVER', 'BRANCH_MANAGER', 'ACCOUNTANT', 'SYSTEM', null],
        nullable: true,
        description: 'Layer 5 — assigned ONLY when there is real financial exposure. Null on stale / zero-cash advisories.',
    }),
    __metadata("design:type", Object)
], ExecutiveTopRiskDto.prototype, "responsible", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String] }),
    __metadata("design:type", Array)
], ExecutiveTopRiskDto.prototype, "recommendedSteps", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ExecutiveTopRiskDto.prototype, "alertType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        type: () => cash_execution_dto_1.CashExecutionBlockDto,
        nullable: true,
        description: 'Operational tracking — last action taken on this driver, current status (OPEN/IN_PROGRESS/RESOLVED), and repeat-offender stats. Null when no action has ever been recorded AND the driver has never been flagged.',
    }),
    __metadata("design:type", Object)
], ExecutiveTopRiskDto.prototype, "execution", void 0);
class ExecutiveActionDto {
    driverName;
    action;
    urgency;
    responsible;
    amount;
    alertType;
}
exports.ExecutiveActionDto = ExecutiveActionDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], ExecutiveActionDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ExecutiveActionDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['HIGH', 'MEDIUM', 'LOW'] }),
    __metadata("design:type", String)
], ExecutiveActionDto.prototype, "urgency", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ['DRIVER', 'BRANCH_MANAGER', 'ACCOUNTANT', 'SYSTEM', null],
        nullable: true,
    }),
    __metadata("design:type", Object)
], ExecutiveActionDto.prototype, "responsible", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ExecutiveActionDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ExecutiveActionDto.prototype, "alertType", void 0);
class ExecutiveSummaryDto {
    activeDrivers;
    driversAtRisk;
    criticalAlerts;
    warningAlerts;
}
exports.ExecutiveSummaryDto = ExecutiveSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ExecutiveSummaryDto.prototype, "activeDrivers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ExecutiveSummaryDto.prototype, "driversAtRisk", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ExecutiveSummaryDto.prototype, "criticalAlerts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ExecutiveSummaryDto.prototype, "warningAlerts", void 0);
class ExecutiveAuditReferenceDto {
    totalAlerts;
    hiddenStaleDrivers;
    totalCashInFlight;
    lastPollAt;
}
exports.ExecutiveAuditReferenceDto = ExecutiveAuditReferenceDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total alerts in the audit-truth layer (/live).' }),
    __metadata("design:type", Number)
], ExecutiveAuditReferenceDto.prototype, "totalAlerts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Stale shifts that were filtered from the operational view.' }),
    __metadata("design:type", Number)
], ExecutiveAuditReferenceDto.prototype, "hiddenStaleDrivers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total cash in flight on the audit layer (KD).' }),
    __metadata("design:type", String)
], ExecutiveAuditReferenceDto.prototype, "totalCashInFlight", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ISO timestamp of the last underlying poll.' }),
    __metadata("design:type", Object)
], ExecutiveAuditReferenceDto.prototype, "lastPollAt", void 0);
class CashExecutiveResponseDto {
    systemStatus;
    generatedAt;
    topRisk;
    actions;
    summary;
    auditReference;
    decisionNote;
    silentAlerts;
    readOnly;
    advisoryOnly;
}
exports.CashExecutiveResponseDto = CashExecutiveResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['GREEN', 'YELLOW', 'RED'] }),
    __metadata("design:type", String)
], CashExecutiveResponseDto.prototype, "systemStatus", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashExecutiveResponseDto.prototype, "generatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: ExecutiveTopRiskDto }),
    __metadata("design:type", Object)
], CashExecutiveResponseDto.prototype, "topRisk", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [ExecutiveActionDto] }),
    __metadata("design:type", Array)
], CashExecutiveResponseDto.prototype, "actions", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", ExecutiveSummaryDto)
], CashExecutiveResponseDto.prototype, "summary", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", ExecutiveAuditReferenceDto)
], CashExecutiveResponseDto.prototype, "auditReference", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Constant string the dashboard renders verbatim.',
    }),
    __metadata("design:type", String)
], CashExecutiveResponseDto.prototype, "decisionNote", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        type: [cash_exposure_dto_1.ExposureSilentAlertDto],
        nullable: true,
        description: 'Silent financial-safety alerts (driver exposure + aging escalation). Populated for OWNER / GENERAL_MANAGER / ACCOUNTANT consumers and `null` for MANAGER consumers (never shown on the manager dashboard).',
    }),
    __metadata("design:type", Object)
], CashExecutiveResponseDto.prototype, "silentAlerts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Always true.' }),
    __metadata("design:type", Boolean)
], CashExecutiveResponseDto.prototype, "readOnly", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Always true.' }),
    __metadata("design:type", Boolean)
], CashExecutiveResponseDto.prototype, "advisoryOnly", void 0);
//# sourceMappingURL=cash-executive.dto.js.map