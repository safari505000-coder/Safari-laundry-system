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
exports.SystemConfigResponseDto = exports.GuardianPhoneResolvedDto = exports.UpdateSystemConfigDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class UpdateSystemConfigDto {
    guardianPhone;
}
exports.UpdateSystemConfigDto = UpdateSystemConfigDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        description: 'WhatsApp alert recipient for System Guardian alerts. Accepted formats: `965XXXXXXXX`, `+965XXXXXXXX`, or local `5/6/9XXXXXXX`. Send `null` or an empty string to clear and fall back to the env variable.',
        example: '96591234567',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(32),
    __metadata("design:type", Object)
], UpdateSystemConfigDto.prototype, "guardianPhone", void 0);
class GuardianPhoneResolvedDto {
    phone;
    source;
}
exports.GuardianPhoneResolvedDto = GuardianPhoneResolvedDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, example: '96591234567' }),
    __metadata("design:type", Object)
], GuardianPhoneResolvedDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ['database', 'env', 'none'],
        description: 'Where the active phone came from. `database` = configured by the Owner from the UI, `env` = legacy env fallback, `none` = no recipient configured (Guardian will skip WhatsApp delivery).',
    }),
    __metadata("design:type", String)
], GuardianPhoneResolvedDto.prototype, "source", void 0);
class SystemConfigResponseDto {
    guardianPhone;
    resolved;
    updatedAt;
}
exports.SystemConfigResponseDto = SystemConfigResponseDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        description: 'The phone number persisted in the SystemConfig table. `null` when the Owner has not configured a value (the env fallback may still apply — see `resolved`).',
    }),
    __metadata("design:type", Object)
], SystemConfigResponseDto.prototype, "guardianPhone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: GuardianPhoneResolvedDto,
        description: 'The phone the System Guardian will actually use right now after applying the DB → env → none fallback chain.',
    }),
    __metadata("design:type", GuardianPhoneResolvedDto)
], SystemConfigResponseDto.prototype, "resolved", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        description: 'ISO timestamp of the last UI save, or null when never set.',
    }),
    __metadata("design:type", Object)
], SystemConfigResponseDto.prototype, "updatedAt", void 0);
//# sourceMappingURL=system-config.dto.js.map