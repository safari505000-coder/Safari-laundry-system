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
exports.CashExecutionActionResponseDto = exports.CashExecutionBlockDto = exports.CashExecutionActionRequestDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class CashExecutionActionRequestDto {
    driverId;
    action;
    note;
    alertType;
}
exports.CashExecutionActionRequestDto = CashExecutionActionRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Driver the action targets.' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(1, 200),
    __metadata("design:type", String)
], CashExecutionActionRequestDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['CONTACTED', 'FOLLOWED_UP', 'ESCALATED'] }),
    (0, class_validator_1.IsIn)(['CONTACTED', 'FOLLOWED_UP', 'ESCALATED']),
    __metadata("design:type", String)
], CashExecutionActionRequestDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Free-text operator note (e.g. "called twice, no answer").',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CashExecutionActionRequestDto.prototype, "note", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Optional alertType the action was triggered from. Stored verbatim for traceability.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], CashExecutionActionRequestDto.prototype, "alertType", void 0);
class CashExecutionBlockDto {
    status;
    lastAction;
    lastActionAt;
    lastActor;
    flagsToday;
    flagsThisWeek;
    repeatIssue;
}
exports.CashExecutionBlockDto = CashExecutionBlockDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED'] }),
    __metadata("design:type", String)
], CashExecutionBlockDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        enum: ['CONTACTED', 'FOLLOWED_UP', 'ESCALATED', null],
    }),
    __metadata("design:type", Object)
], CashExecutionBlockDto.prototype, "lastAction", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], CashExecutionBlockDto.prototype, "lastActionAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], CashExecutionBlockDto.prototype, "lastActor", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Times this driver entered the at-risk set today (Asia/Kuwait).' }),
    __metadata("design:type", Number)
], CashExecutionBlockDto.prototype, "flagsToday", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Times this driver entered the at-risk set in the last 7 days.' }),
    __metadata("design:type", Number)
], CashExecutionBlockDto.prototype, "flagsThisWeek", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'True when flagsThisWeek > 3.' }),
    __metadata("design:type", Boolean)
], CashExecutionBlockDto.prototype, "repeatIssue", void 0);
class CashExecutionActionResponseDto {
    driverId;
    recordedAt;
    execution;
    readOnlyFinancial;
}
exports.CashExecutionActionResponseDto = CashExecutionActionResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashExecutionActionResponseDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashExecutionActionResponseDto.prototype, "recordedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", CashExecutionBlockDto)
], CashExecutionActionResponseDto.prototype, "execution", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Always true — no financial state was changed.' }),
    __metadata("design:type", Boolean)
], CashExecutionActionResponseDto.prototype, "readOnlyFinancial", void 0);
//# sourceMappingURL=cash-execution.dto.js.map