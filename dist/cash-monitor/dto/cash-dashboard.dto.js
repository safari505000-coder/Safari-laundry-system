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
exports.CashDashboardResponseDto = exports.CashDashboardBranchSummaryDto = exports.CashDashboardBranchDto = exports.CashDashboardDriverDto = exports.CashDashboardAlertsDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const cash_classified_dto_1 = require("./cash-classified.dto");
const cash_executive_dto_1 = require("./cash-executive.dto");
class CashDashboardAlertsDto {
    financial;
    compliance;
}
exports.CashDashboardAlertsDto = CashDashboardAlertsDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        type: () => cash_classified_dto_1.ClassifiedAlertDto,
        isArray: true,
        description: 'Money-risk alerts (drive the dashboard color). Mirrors `classified.financialAlerts` verbatim.',
    }),
    __metadata("design:type", Array)
], CashDashboardAlertsDto.prototype, "financial", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: () => cash_classified_dto_1.ClassifiedAlertDto,
        isArray: true,
        description: 'Operational compliance items. NEVER escalate the dashboard. Mirrors `classified.complianceAlerts` verbatim.',
    }),
    __metadata("design:type", Array)
], CashDashboardAlertsDto.prototype, "compliance", void 0);
class CashDashboardDriverDto {
    driverId;
    name;
    totalCash;
    status;
    oldestAgeHours;
}
exports.CashDashboardDriverDto = CashDashboardDriverDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashDashboardDriverDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Display name for the dashboard. Falls back to driverId when the classifier has no name on file (still never null).',
    }),
    __metadata("design:type", String)
], CashDashboardDriverDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Per-driver cash residue (KD, 4 decimals). Reads `classified.drivers[].amount` verbatim — no recomputation.',
    }),
    __metadata("design:type", String)
], CashDashboardDriverDto.prototype, "totalCash", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ['NORMAL', 'COMPLIANCE_ONLY', 'AT_RISK'],
        description: 'Inherited from `classified.drivers[].status`.',
    }),
    __metadata("design:type", String)
], CashDashboardDriverDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Hours since the OLDEST live cash unit attributed to this driver. Inherited from `classified.drivers[].cashAgeHours`.',
    }),
    __metadata("design:type", Number)
], CashDashboardDriverDto.prototype, "oldestAgeHours", void 0);
class CashDashboardBranchDto {
    branchId;
    name;
    currentBranchCash;
    openBagCount;
}
exports.CashDashboardBranchDto = CashDashboardBranchDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashDashboardBranchDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Branch display name. Falls back to branchId when the lookup has no row (still never null).',
    }),
    __metadata("design:type", String)
], CashDashboardBranchDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Cash currently held by the branch (KD, 4 decimals). = SUM(custody.amountKd) over open bags whose status is in {PENDING_DEPOSIT, AWAITING_VERIFICATION, VERIFIED} AND whose linked BankDepositLog does not yet exist. NEVER computed from invoices.',
    }),
    __metadata("design:type", String)
], CashDashboardBranchDto.prototype, "currentBranchCash", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Number of open custody bags contributing to currentBranchCash.',
    }),
    __metadata("design:type", Number)
], CashDashboardBranchDto.prototype, "openBagCount", void 0);
class CashDashboardBranchSummaryDto {
    rows;
    totalCurrentBranchCash;
    unattributedCustodyKd;
    unattributedCustodyBagCount;
}
exports.CashDashboardBranchSummaryDto = CashDashboardBranchSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        type: () => CashDashboardBranchDto,
        isArray: true,
        description: 'Per-branch projection. Sorted by currentBranchCash DESC, then by name ASC.',
    }),
    __metadata("design:type", Array)
], CashDashboardBranchSummaryDto.prototype, "rows", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Σ branches[].currentBranchCash, fixed-4 KD. The SSoT total of cash currently in branch hands across the whole system.',
    }),
    __metadata("design:type", String)
], CashDashboardBranchSummaryDto.prototype, "totalCurrentBranchCash", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Cash in custody bags with NO branchId (legacy). Surfaced explicitly so it cannot be silently merged into a branch number. Operators must investigate -- the dashboard does not auto-resolve.',
    }),
    __metadata("design:type", String)
], CashDashboardBranchSummaryDto.prototype, "unattributedCustodyKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Number of unattributed-custody bags.',
    }),
    __metadata("design:type", Number)
], CashDashboardBranchSummaryDto.prototype, "unattributedCustodyBagCount", void 0);
class CashDashboardResponseDto {
    systemStatus;
    totalCash;
    summaryText;
    alerts;
    drivers;
    branches;
    topRisk;
    generatedAt;
    readOnly;
    advisoryOnly;
}
exports.CashDashboardResponseDto = CashDashboardResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ['GREEN', 'YELLOW', 'RED'],
        description: 'Inherited verbatim from `classified.systemStatus` — the only sanctioned producer of the traffic light.',
    }),
    __metadata("design:type", String)
], CashDashboardResponseDto.prototype, "systemStatus", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Σ classified.drivers[].amount, KD fixed-4 decimals. NEVER computed independently from flows or snapshot.summary.',
    }),
    __metadata("design:type", String)
], CashDashboardResponseDto.prototype, "totalCash", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Arabic operator label derived ONLY from `systemStatus`. GREEN → "مستقر", YELLOW → "انتباه تشغيلي", RED → "خطر مالي".',
    }),
    __metadata("design:type", String)
], CashDashboardResponseDto.prototype, "summaryText", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: () => CashDashboardAlertsDto,
        description: 'Both alert buckets, exactly as the classifier emits them.',
    }),
    __metadata("design:type", CashDashboardAlertsDto)
], CashDashboardResponseDto.prototype, "alerts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: () => CashDashboardDriverDto,
        isArray: true,
        description: 'Direct projection of `classified.drivers`. The order matches the classifier; the frontend may sort for display but MUST NOT recompute totals.',
    }),
    __metadata("design:type", Array)
], CashDashboardResponseDto.prototype, "drivers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: () => CashDashboardBranchSummaryDto,
        description: 'SSoT branch-cash slice. Branch cash is DERIVED from custody bags + bank deposits via BranchCashLedgerService; the frontend MUST read these values verbatim and NEVER aggregate from invoices or order totals.',
    }),
    __metadata("design:type", CashDashboardBranchSummaryDto)
], CashDashboardResponseDto.prototype, "branches", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        type: () => cash_executive_dto_1.ExecutiveTopRiskDto,
        nullable: true,
        description: 'Verbatim `executive.topRisk`. Null when there is no actionable top risk — never recomputed here.',
    }),
    __metadata("design:type", Object)
], CashDashboardResponseDto.prototype, "topRisk", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'ISO timestamp the dashboard payload was assembled.',
    }),
    __metadata("design:type", String)
], CashDashboardResponseDto.prototype, "generatedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Always true.' }),
    __metadata("design:type", Boolean)
], CashDashboardResponseDto.prototype, "readOnly", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Always true.' }),
    __metadata("design:type", Boolean)
], CashDashboardResponseDto.prototype, "advisoryOnly", void 0);
//# sourceMappingURL=cash-dashboard.dto.js.map