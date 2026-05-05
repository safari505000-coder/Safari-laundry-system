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
exports.DiagnosticsResponseDto = exports.DiagnosticsSummaryDto = exports.DiagnosticItemDto = exports.DiagnosticValuesDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class DiagnosticValuesDto {
    classified;
    risk;
    executive;
    live;
    operational;
}
exports.DiagnosticValuesDto = DiagnosticValuesDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], DiagnosticValuesDto.prototype, "classified", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], DiagnosticValuesDto.prototype, "risk", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], DiagnosticValuesDto.prototype, "executive", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], DiagnosticValuesDto.prototype, "live", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], DiagnosticValuesDto.prototype, "operational", void 0);
class DiagnosticItemDto {
    id;
    source;
    issueType;
    driverId;
    driverName;
    severity;
    values;
    delta;
    rootCause;
    explanationAr;
    action;
    timestamp;
    formatted;
}
exports.DiagnosticItemDto = DiagnosticItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Stable id derived from the source issue.' }),
    __metadata("design:type", String)
], DiagnosticItemDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['GUARDIAN', 'INTEGRITY_AUDIT', 'DRIVER_AMOUNT_AUDIT'] }),
    __metadata("design:type", String)
], DiagnosticItemDto.prototype, "source", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Canonical, machine-readable issue label.' }),
    __metadata("design:type", String)
], DiagnosticItemDto.prototype, "issueType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], DiagnosticItemDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], DiagnosticItemDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['CRITICAL', 'WARNING'] }),
    __metadata("design:type", String)
], DiagnosticItemDto.prototype, "severity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: () => DiagnosticValuesDto,
        description: 'Per-layer numbers/states the engine compared. KD strings (4 dp) for amounts, status strings for traffic lights.',
    }),
    __metadata("design:type", DiagnosticValuesDto)
], DiagnosticItemDto.prototype, "values", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'max(value) - min(value) — KD when numeric, blank string when the comparison was symbolic (status drift).',
    }),
    __metadata("design:type", String)
], DiagnosticItemDto.prototype, "delta", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: [
            'SNAPSHOT_DRIFT',
            'CLASSIFICATION_MISMATCH',
            'CACHE_STALE',
            'MAPPING_ERROR',
            'AGGREGATION_BUG',
            'AMOUNT_FLOOR_VIOLATION',
            'AGE_GATE_VIOLATION',
            'UNKNOWN',
        ],
    }),
    __metadata("design:type", String)
], DiagnosticItemDto.prototype, "rootCause", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Plain-Arabic explanation written for operations managers.' }),
    __metadata("design:type", String)
], DiagnosticItemDto.prototype, "explanationAr", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Exact recommended action.' }),
    __metadata("design:type", String)
], DiagnosticItemDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'When the diagnosis ran (ISO).' }),
    __metadata("design:type", String)
], DiagnosticItemDto.prototype, "timestamp", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Pre-rendered Arabic block (🚨 SYSTEM ALERT …) — feed directly to WhatsApp / dashboard ticker.',
    }),
    __metadata("design:type", String)
], DiagnosticItemDto.prototype, "formatted", void 0);
class DiagnosticsSummaryDto {
    total;
    critical;
    warning;
    uniqueRootCauses;
}
exports.DiagnosticsSummaryDto = DiagnosticsSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], DiagnosticsSummaryDto.prototype, "total", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], DiagnosticsSummaryDto.prototype, "critical", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], DiagnosticsSummaryDto.prototype, "warning", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'How many distinct root causes are represented. Useful to spot when one upstream bug is responsible for many symptoms.',
    }),
    __metadata("design:type", Number)
], DiagnosticsSummaryDto.prototype, "uniqueRootCauses", void 0);
class DiagnosticsResponseDto {
    items;
    summary;
    generatedAt;
    readOnly;
}
exports.DiagnosticsResponseDto = DiagnosticsResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [DiagnosticItemDto] }),
    __metadata("design:type", Array)
], DiagnosticsResponseDto.prototype, "items", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => DiagnosticsSummaryDto }),
    __metadata("design:type", DiagnosticsSummaryDto)
], DiagnosticsResponseDto.prototype, "summary", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DiagnosticsResponseDto.prototype, "generatedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Always true — diagnostic engine never writes.' }),
    __metadata("design:type", Boolean)
], DiagnosticsResponseDto.prototype, "readOnly", void 0);
//# sourceMappingURL=diagnostics.dto.js.map