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
exports.IntegrityAuditResponseDto = exports.IntegrityAuditSummaryDto = exports.IntegrityIssueDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class IntegrityIssueDto {
    type;
    severity;
    driverId;
    driverName;
    expected;
    found;
    sourceA;
    sourceB;
    delta;
    message;
}
exports.IntegrityIssueDto = IntegrityIssueDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], IntegrityIssueDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['CRITICAL', 'WARNING'] }),
    __metadata("design:type", String)
], IntegrityIssueDto.prototype, "severity", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], IntegrityIssueDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], IntegrityIssueDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        description: 'Expected value as a string. May be a number, status, or count.',
    }),
    __metadata("design:type", Object)
], IntegrityIssueDto.prototype, "expected", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        description: 'Observed value. Same encoding as `expected`.',
    }),
    __metadata("design:type", Object)
], IntegrityIssueDto.prototype, "found", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Logical name of the first layer that produced the value (e.g. "/classified", "/risk").',
    }),
    __metadata("design:type", String)
], IntegrityIssueDto.prototype, "sourceA", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        description: 'Logical name of the second layer being compared. Null for single-source violations (threshold rules).',
    }),
    __metadata("design:type", Object)
], IntegrityIssueDto.prototype, "sourceB", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        description: 'Numeric delta as a string when the comparison is numeric. Null otherwise.',
    }),
    __metadata("design:type", Object)
], IntegrityIssueDto.prototype, "delta", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], IntegrityIssueDto.prototype, "message", void 0);
class IntegrityAuditSummaryDto {
    driversChecked;
    alertsChecked;
    layersChecked;
    mismatches;
    warnings;
    generatedAt;
}
exports.IntegrityAuditSummaryDto = IntegrityAuditSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], IntegrityAuditSummaryDto.prototype, "driversChecked", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], IntegrityAuditSummaryDto.prototype, "alertsChecked", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], IntegrityAuditSummaryDto.prototype, "layersChecked", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], IntegrityAuditSummaryDto.prototype, "mismatches", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], IntegrityAuditSummaryDto.prototype, "warnings", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], IntegrityAuditSummaryDto.prototype, "generatedAt", void 0);
class IntegrityAuditResponseDto {
    status;
    blocked;
    criticalIssues;
    warnings;
    summary;
    readOnly;
}
exports.IntegrityAuditResponseDto = IntegrityAuditResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['PASS', 'FAIL'] }),
    __metadata("design:type", String)
], IntegrityAuditResponseDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'True when at least one CRITICAL issue was detected. Operators must treat the dashboard as suspect until this is `false`.',
    }),
    __metadata("design:type", Boolean)
], IntegrityAuditResponseDto.prototype, "blocked", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [IntegrityIssueDto] }),
    __metadata("design:type", Array)
], IntegrityAuditResponseDto.prototype, "criticalIssues", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [IntegrityIssueDto] }),
    __metadata("design:type", Array)
], IntegrityAuditResponseDto.prototype, "warnings", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", IntegrityAuditSummaryDto)
], IntegrityAuditResponseDto.prototype, "summary", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Always true — this audit never writes data.' }),
    __metadata("design:type", Boolean)
], IntegrityAuditResponseDto.prototype, "readOnly", void 0);
//# sourceMappingURL=integrity-audit.dto.js.map