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
exports.CashIntelligenceAnalysisDto = exports.CashV2AnomalyDto = exports.CashV2FlowDto = exports.CashV2LocationSummaryDto = exports.CashV2SummaryDto = exports.CashV2ExecutionSummaryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class CashV2ExecutionSummaryDto {
    dataFetched;
    logicApplied;
    ignoredCases;
    assumptions;
    toleranceKd;
    shiftOverdueCapHours;
    asOfDate;
    generatedAt;
}
exports.CashV2ExecutionSummaryDto = CashV2ExecutionSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String], description: 'Tables and selectors actually queried (read-only).' }),
    __metadata("design:type", Array)
], CashV2ExecutionSummaryDto.prototype, "dataFetched", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String], description: 'Pipeline steps actually applied.' }),
    __metadata("design:type", Array)
], CashV2ExecutionSummaryDto.prototype, "logicApplied", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String], description: 'Records suppressed and the WHY (anti-false-positive trail).' }),
    __metadata("design:type", Array)
], CashV2ExecutionSummaryDto.prototype, "ignoredCases", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String], description: 'Assumptions made where the prompt was ambiguous.' }),
    __metadata("design:type", Array)
], CashV2ExecutionSummaryDto.prototype, "assumptions", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Tolerance band applied to amount comparisons (KD, 4 dp).' }),
    __metadata("design:type", String)
], CashV2ExecutionSummaryDto.prototype, "toleranceKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Cap applied to open shifts before SHIFT_OVERDUE fires (hours).' }),
    __metadata("design:type", Number)
], CashV2ExecutionSummaryDto.prototype, "shiftOverdueCapHours", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Asia/Kuwait calendar day used as the report anchor.' }),
    __metadata("design:type", String)
], CashV2ExecutionSummaryDto.prototype, "asOfDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ISO timestamp when the report was generated.' }),
    __metadata("design:type", String)
], CashV2ExecutionSummaryDto.prototype, "generatedAt", void 0);
class CashV2SummaryDto {
    totalCash;
    newCash;
    agedCash;
    issues;
}
exports.CashV2SummaryDto = CashV2SummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashV2SummaryDto.prototype, "totalCash", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashV2SummaryDto.prototype, "newCash", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashV2SummaryDto.prototype, "agedCash", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], CashV2SummaryDto.prototype, "issues", void 0);
class CashV2LocationSummaryDto {
    DRIVER;
    CUSTODY;
    BANK;
}
exports.CashV2LocationSummaryDto = CashV2LocationSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Cash currently with drivers (DRIVER + DRIVER_HANDOVER).' }),
    __metadata("design:type", String)
], CashV2LocationSummaryDto.prototype, "DRIVER", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Cash held by branch manager custody (CUSTODY + VERIFIED).' }),
    __metadata("design:type", String)
], CashV2LocationSummaryDto.prototype, "CUSTODY", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Cash logged at the bank (DEPOSIT + BANK).' }),
    __metadata("design:type", String)
], CashV2LocationSummaryDto.prototype, "BANK", void 0);
class CashV2FlowDto {
    driverId;
    driverName;
    branchId;
    amount;
    amountTier;
    originDate;
    ageDays;
    ageHours;
    stage;
    driverGate;
    shiftStatus;
    shiftDurationHours;
    ignoredNonOperational;
    contextReason;
}
exports.CashV2FlowDto = CashV2FlowDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashV2FlowDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], CashV2FlowDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], CashV2FlowDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashV2FlowDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashV2FlowDto.prototype, "amountTier", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Asia/Kuwait YYYY-MM-DD.' }),
    __metadata("design:type", String)
], CashV2FlowDto.prototype, "originDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], CashV2FlowDto.prototype, "ageDays", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Sub-day cash age in hours (now − Order.completedAt). Two decimals. Used by the Risk Engine for the 24h grace gate and per-unit scoring.',
    }),
    __metadata("design:type", Number)
], CashV2FlowDto.prototype, "ageHours", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashV2FlowDto.prototype, "stage", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashV2FlowDto.prototype, "driverGate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Driver shift status AT REPORT TIME.' }),
    __metadata("design:type", String)
], CashV2FlowDto.prototype, "shiftStatus", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], CashV2FlowDto.prototype, "shiftDurationHours", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'True when context validator suppresses this row.' }),
    __metadata("design:type", Boolean)
], CashV2FlowDto.prototype, "ignoredNonOperational", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Why the row was or was not suppressed.' }),
    __metadata("design:type", String)
], CashV2FlowDto.prototype, "contextReason", void 0);
class CashV2AnomalyDto {
    type;
    severity;
    amount;
    amountTier;
    ageDays;
    stage;
    responsible;
    driverId;
    branchId;
    reason;
    actionLocked;
    requiresManualReview;
}
exports.CashV2AnomalyDto = CashV2AnomalyDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashV2AnomalyDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashV2AnomalyDto.prototype, "severity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashV2AnomalyDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashV2AnomalyDto.prototype, "amountTier", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], CashV2AnomalyDto.prototype, "ageDays", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashV2AnomalyDto.prototype, "stage", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashV2AnomalyDto.prototype, "responsible", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], CashV2AnomalyDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], CashV2AnomalyDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashV2AnomalyDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'STEP 9 Decision Lock — true when severity may NOT trigger penalty/payroll action without manual review (anomaly age < 2 days).',
    }),
    __metadata("design:type", Boolean)
], CashV2AnomalyDto.prototype, "actionLocked", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'STEP 9 Decision Lock — anomalies aged 2+ days or ESCALATED still require an explicit manual reviewer before any HR/payroll action.',
    }),
    __metadata("design:type", Boolean)
], CashV2AnomalyDto.prototype, "requiresManualReview", void 0);
class CashIntelligenceAnalysisDto {
    executionSummary;
    systemHealth;
    summary;
    locationSummary;
    flows;
    anomalies;
    finalAssessment;
    readOnly;
    advisoryOnly;
}
exports.CashIntelligenceAnalysisDto = CashIntelligenceAnalysisDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", CashV2ExecutionSummaryDto)
], CashIntelligenceAnalysisDto.prototype, "executionSummary", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['OK', 'WARNING', 'CRITICAL'] }),
    __metadata("design:type", String)
], CashIntelligenceAnalysisDto.prototype, "systemHealth", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", CashV2SummaryDto)
], CashIntelligenceAnalysisDto.prototype, "summary", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", CashV2LocationSummaryDto)
], CashIntelligenceAnalysisDto.prototype, "locationSummary", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [CashV2FlowDto] }),
    __metadata("design:type", Array)
], CashIntelligenceAnalysisDto.prototype, "flows", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [CashV2AnomalyDto] }),
    __metadata("design:type", Array)
], CashIntelligenceAnalysisDto.prototype, "anomalies", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashIntelligenceAnalysisDto.prototype, "finalAssessment", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Always true. Endpoint never mutates state.' }),
    __metadata("design:type", Boolean)
], CashIntelligenceAnalysisDto.prototype, "readOnly", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Always true. STEP 9 — this layer is advisory; downstream systems must not auto-apply penalties.',
    }),
    __metadata("design:type", Boolean)
], CashIntelligenceAnalysisDto.prototype, "advisoryOnly", void 0);
//# sourceMappingURL=cash-intelligence-analysis.dto.js.map