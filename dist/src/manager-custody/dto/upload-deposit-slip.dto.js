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
exports.UploadDepositSlipDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class UploadDepositSlipDto {
    depositSlipUrl;
    declaredDepositTotal;
    note;
}
exports.UploadDepositSlipDto = UploadDepositSlipDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Public URL of the uploaded deposit slip image (from POST /api/manager-custody/upload-slip-image).',
        example: '/uploads/deposit-slips/9f3c…-slip.jpg',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8),
    __metadata("design:type", String)
], UploadDepositSlipDto.prototype, "depositSlipUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Declared deposited amount (KWD). Must match custody amount within 0.0001 KWD.',
        example: 450.25,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsPositive)(),
    __metadata("design:type", Number)
], UploadDepositSlipDto.prototype, "declaredDepositTotal", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], UploadDepositSlipDto.prototype, "note", void 0);
//# sourceMappingURL=upload-deposit-slip.dto.js.map