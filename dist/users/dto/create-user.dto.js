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
exports.CreateUserDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const class_validator_1 = require("class-validator");
const SAFARI_ROLE_VALUES = [
    'OWNER',
    'GENERAL_MANAGER',
    'MANAGER',
    'DRIVER',
    'WORKER',
    'CALL_CENTER',
    'CALL_CENTER_SUPERVISOR',
    'FLEET_SUPERVISOR',
    'ACCOUNTANT',
    'SUPERVISOR',
    'VIEWER',
];
class CreateUserDto {
    fullName;
    username;
    password;
    safariRole;
    phone;
    jobTitle;
    branchId;
    isActive;
    payrollRosterLineOrder;
}
exports.CreateUserDto = CreateUserDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Ahmad Ali', description: 'Full name as shown in the app' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    __metadata("design:type", String)
], CreateUserDto.prototype, "fullName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'ahmad.ali',
        description: 'Unique staff username / staff ID used at login',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.Matches)(/^[\w.-]+$/, {
        message: 'username may contain letters, numbers, dots, dashes, and underscores',
    }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minLength: 1, example: 'x' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    __metadata("design:type", String)
], CreateUserDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: client_1.SafariRole,
        enumName: 'SafariRole',
        example: client_1.SafariRole.DRIVER,
        description: 'OWNER · GENERAL_MANAGER (Owner proxy) · MANAGER · SUPERVISOR: operations · VIEWER · ACCOUNTANT: read-only/finance · DRIVER · CALL_CENTER · CALL_CENTER_SUPERVISOR (full CC + same-day invoice edit/void + team performance reports) · FLEET_SUPERVISOR (vehicle expenses with mandatory receipt → accountant approval)',
    }),
    (0, class_validator_1.IsIn)(SAFARI_ROLE_VALUES, {
        message: `safariRole must be one of: ${SAFARI_ROLE_VALUES.join(', ')}`,
    }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "safariRole", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: '+971 4 000 0000',
        description: 'Optional; unique if provided',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateUserDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'سائق توصيل',
        description: 'Optional job title / profession shown in staff lists.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreateUserDto.prototype, "jobTitle", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'uuid', description: 'Mandatory branch assignment for all staff.' }),
    (0, class_validator_1.IsUUID)('4'),
    __metadata("design:type", String)
], CreateUserDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        default: true,
        description: 'Inactive users are blocked from login immediately.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateUserDto.prototype, "isActive", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Optional line order on مسير الرواتب within the branch; lower prints first.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((_, v) => v !== null && v !== undefined),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(9999),
    __metadata("design:type", Object)
], CreateUserDto.prototype, "payrollRosterLineOrder", void 0);
//# sourceMappingURL=create-user.dto.js.map