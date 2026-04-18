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
exports.DebtRecoveryReportDto = exports.DebtRecoveryDayRowDto = exports.DebtRecoveryQueryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
class DebtRecoveryQueryDto {
    from;
    to;
}
exports.DebtRecoveryQueryDto = DebtRecoveryQueryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ required: false, example: '2026-04-01' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(ISO_DATE, { message: 'from must be YYYY-MM-DD' }),
    __metadata("design:type", String)
], DebtRecoveryQueryDto.prototype, "from", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false, example: '2026-04-18' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(ISO_DATE, { message: 'to must be YYYY-MM-DD' }),
    __metadata("design:type", String)
], DebtRecoveryQueryDto.prototype, "to", void 0);
class DebtRecoveryDayRowDto {
    dayIso;
    recoveredKd;
    settlementCount;
    subscriptionCount;
}
exports.DebtRecoveryDayRowDto = DebtRecoveryDayRowDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-04-18' }),
    __metadata("design:type", String)
], DebtRecoveryDayRowDto.prototype, "dayIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '120.5000' }),
    __metadata("design:type", String)
], DebtRecoveryDayRowDto.prototype, "recoveredKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 4 }),
    __metadata("design:type", Number)
], DebtRecoveryDayRowDto.prototype, "settlementCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 2 }),
    __metadata("design:type", Number)
], DebtRecoveryDayRowDto.prototype, "subscriptionCount", void 0);
class DebtRecoveryReportDto {
    from;
    to;
    totalRecoveredKd;
    days;
}
exports.DebtRecoveryReportDto = DebtRecoveryReportDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-04-01' }),
    __metadata("design:type", String)
], DebtRecoveryReportDto.prototype, "from", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-04-18' }),
    __metadata("design:type", String)
], DebtRecoveryReportDto.prototype, "to", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2350.7500' }),
    __metadata("design:type", String)
], DebtRecoveryReportDto.prototype, "totalRecoveredKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [DebtRecoveryDayRowDto] }),
    __metadata("design:type", Array)
], DebtRecoveryReportDto.prototype, "days", void 0);
//# sourceMappingURL=debt-recovery-report.dto.js.map