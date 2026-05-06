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
exports.BulkResetPasswordBodyDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class BulkResetPasswordBodyDto {
    userIds;
    newPassword;
}
exports.BulkResetPasswordBodyDto = BulkResetPasswordBodyDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        type: [String],
        format: 'uuid',
        description: 'Distinct staff user ids — duplicates are de-duplicated server-side.',
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.IsUUID)('4', { each: true }),
    __metadata("design:type", Array)
], BulkResetPasswordBodyDto.prototype, "userIds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Single password applied to every listed user; each must change at next login.',
        minLength: 6,
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(6),
    __metadata("design:type", String)
], BulkResetPasswordBodyDto.prototype, "newPassword", void 0);
//# sourceMappingURL=bulk-reset-password-body.dto.js.map