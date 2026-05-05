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
exports.GuardianStatusResponseDto = exports.GuardianResponseDto = exports.GuardianAlertHistoryEntryDto = exports.GuardianHealthSnapshotDto = exports.GuardianIssueDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class GuardianIssueDto {
    id;
    severity;
    check;
    message;
    driverId;
    driverName;
    expected;
    found;
    delta;
    context;
    firstSeenAt;
    lastSeenAt;
    occurrences;
}
exports.GuardianIssueDto = GuardianIssueDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], GuardianIssueDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['INFO', 'WARNING', 'CRITICAL'] }),
    __metadata("design:type", String)
], GuardianIssueDto.prototype, "severity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], GuardianIssueDto.prototype, "check", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], GuardianIssueDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], GuardianIssueDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], GuardianIssueDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], GuardianIssueDto.prototype, "expected", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], GuardianIssueDto.prototype, "found", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], GuardianIssueDto.prototype, "delta", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: Object }),
    __metadata("design:type", Object)
], GuardianIssueDto.prototype, "context", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ISO-8601 timestamp the issue was first observed.' }),
    __metadata("design:type", String)
], GuardianIssueDto.prototype, "firstSeenAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ISO-8601 timestamp of the latest observation.' }),
    __metadata("design:type", String)
], GuardianIssueDto.prototype, "lastSeenAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'How many times this issue (by stable key) has been observed in the rolling window.' }),
    __metadata("design:type", Number)
], GuardianIssueDto.prototype, "occurrences", void 0);
class GuardianHealthSnapshotDto {
    classified;
    risk;
    executive;
    classifiedLatencyMs;
    riskLatencyMs;
    executiveLatencyMs;
}
exports.GuardianHealthSnapshotDto = GuardianHealthSnapshotDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['GREEN', 'YELLOW', 'RED'], nullable: true }),
    __metadata("design:type", Object)
], GuardianHealthSnapshotDto.prototype, "classified", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['GREEN', 'YELLOW', 'RED'], nullable: true }),
    __metadata("design:type", Object)
], GuardianHealthSnapshotDto.prototype, "risk", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['GREEN', 'YELLOW', 'RED'], nullable: true }),
    __metadata("design:type", Object)
], GuardianHealthSnapshotDto.prototype, "executive", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, description: 'Roundtrip ms for /classified.' }),
    __metadata("design:type", Object)
], GuardianHealthSnapshotDto.prototype, "classifiedLatencyMs", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], GuardianHealthSnapshotDto.prototype, "riskLatencyMs", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], GuardianHealthSnapshotDto.prototype, "executiveLatencyMs", void 0);
class GuardianAlertHistoryEntryDto {
    timestamp;
    status;
    severity;
    issuesCount;
    sentToWhatsApp;
    whatsAppError;
}
exports.GuardianAlertHistoryEntryDto = GuardianAlertHistoryEntryDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], GuardianAlertHistoryEntryDto.prototype, "timestamp", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['OK', 'ISSUES_FOUND'] }),
    __metadata("design:type", String)
], GuardianAlertHistoryEntryDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['INFO', 'WARNING', 'CRITICAL'] }),
    __metadata("design:type", String)
], GuardianAlertHistoryEntryDto.prototype, "severity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], GuardianAlertHistoryEntryDto.prototype, "issuesCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Was a WhatsApp message dispatched on this sweep?' }),
    __metadata("design:type", Boolean)
], GuardianAlertHistoryEntryDto.prototype, "sentToWhatsApp", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], GuardianAlertHistoryEntryDto.prototype, "whatsAppError", void 0);
class GuardianResponseDto {
    status;
    severity;
    issues;
    health;
    sentToWhatsApp;
    whatsAppError;
    timestamp;
    durationMs;
    readOnly;
}
exports.GuardianResponseDto = GuardianResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['OK', 'ISSUES_FOUND'] }),
    __metadata("design:type", String)
], GuardianResponseDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['INFO', 'WARNING', 'CRITICAL'] }),
    __metadata("design:type", String)
], GuardianResponseDto.prototype, "severity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [GuardianIssueDto] }),
    __metadata("design:type", Array)
], GuardianResponseDto.prototype, "issues", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", GuardianHealthSnapshotDto)
], GuardianResponseDto.prototype, "health", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'True if at least one WhatsApp message was dispatched as part of this sweep.' }),
    __metadata("design:type", Boolean)
], GuardianResponseDto.prototype, "sentToWhatsApp", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, description: 'Error from the WhatsApp provider if delivery failed.' }),
    __metadata("design:type", Object)
], GuardianResponseDto.prototype, "whatsAppError", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], GuardianResponseDto.prototype, "timestamp", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], GuardianResponseDto.prototype, "durationMs", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'True — Guardian never writes to Prisma.' }),
    __metadata("design:type", Boolean)
], GuardianResponseDto.prototype, "readOnly", void 0);
class GuardianStatusResponseDto extends GuardianResponseDto {
    history;
    whatsAppConfigured;
    ownerPhoneMasked;
    ownerPhoneSource;
}
exports.GuardianStatusResponseDto = GuardianStatusResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [GuardianAlertHistoryEntryDto], description: 'Last 20 sweep summaries (newest first).' }),
    __metadata("design:type", Array)
], GuardianStatusResponseDto.prototype, "history", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Whether a WhatsApp provider is configured (Moatmt creds OR webhook).' }),
    __metadata("design:type", Boolean)
], GuardianStatusResponseDto.prototype, "whatsAppConfigured", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, description: 'Masked owner phone (e.g. 965****1855) — exposed for visibility, never the full number.' }),
    __metadata("design:type", Object)
], GuardianStatusResponseDto.prototype, "ownerPhoneMasked", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ['database', 'env', 'none'],
        description: 'Where the active alert recipient was resolved from (DB → env → none). `none` means the Guardian will skip WhatsApp delivery on the next sweep.',
    }),
    __metadata("design:type", String)
], GuardianStatusResponseDto.prototype, "ownerPhoneSource", void 0);
//# sourceMappingURL=system-guardian.dto.js.map