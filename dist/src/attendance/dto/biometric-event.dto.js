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
exports.BiometricEventDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class BiometricEventDto {
    civilId;
    externalUserRef;
    action;
    atIso;
    deviceId;
    meta;
}
exports.BiometricEventDto = BiometricEventDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Kuwaiti Civil ID of the employee the device recognised (preferred).',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(32),
    __metadata("design:type", String)
], BiometricEventDto.prototype, "civilId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Alternative: the device-local user id if the device does not map to civilId.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], BiometricEventDto.prototype, "externalUserRef", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['CHECK_IN', 'CHECK_OUT'] }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['CHECK_IN', 'CHECK_OUT']),
    __metadata("design:type", String)
], BiometricEventDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Device-supplied UTC timestamp of the event.' }),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], BiometricEventDto.prototype, "atIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Device fingerprint / serial for audit.' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], BiometricEventDto.prototype, "deviceId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Optional confidence score or device note.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], BiometricEventDto.prototype, "meta", void 0);
//# sourceMappingURL=biometric-event.dto.js.map