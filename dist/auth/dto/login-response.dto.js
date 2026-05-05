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
exports.LoginResponseDto = exports.LoginUserDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
class LoginUserDto {
    id;
    username;
    fullName;
    phone;
    safariRole;
    branchId;
    linkedCustomerId;
}
exports.LoginUserDto = LoginUserDto;
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'uuid' }),
    __metadata("design:type", String)
], LoginUserDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Staff username / staff ID' }),
    __metadata("design:type", String)
], LoginUserDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Display name' }),
    __metadata("design:type", String)
], LoginUserDto.prototype, "fullName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], LoginUserDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.SafariRole, description: 'Institutional RBAC role' }),
    __metadata("design:type", String)
], LoginUserDto.prototype, "safariRole", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        format: 'uuid',
        description: 'Branch scope for pricing / operations when applicable',
    }),
    __metadata("design:type", Object)
], LoginUserDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        format: 'uuid',
        description: 'B2C portal — binds this login to exactly one Customer.id',
    }),
    __metadata("design:type", Object)
], LoginUserDto.prototype, "linkedCustomerId", void 0);
class LoginResponseDto {
    accessToken;
    refreshToken;
    user;
}
exports.LoginResponseDto = LoginResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Short-lived bearer token (default 15 min) — use Authorization: Bearer <token> for protected routes (e.g. management reports)',
    }),
    __metadata("design:type", String)
], LoginResponseDto.prototype, "accessToken", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Opaque refresh token (default 7 days). Send to POST /api/auth/refresh-token to get a fresh access token without re-hashing the password.',
    }),
    __metadata("design:type", String)
], LoginResponseDto.prototype, "refreshToken", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: LoginUserDto }),
    __metadata("design:type", LoginUserDto)
], LoginResponseDto.prototype, "user", void 0);
//# sourceMappingURL=login-response.dto.js.map