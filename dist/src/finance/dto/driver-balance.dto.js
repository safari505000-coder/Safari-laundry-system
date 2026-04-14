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
exports.HandoverResultDto = exports.DriverBalanceResponseDto = exports.DriverBalanceRowDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class DriverBalanceRowDto {
    driverId;
    employeeId;
    username;
    fullName;
    phone;
    currentShiftId;
    shiftStartedAt;
    heldCashTotal;
    pendingSettlementOrderCount;
}
exports.DriverBalanceRowDto = DriverBalanceRowDto;
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'uuid' }),
    __metadata("design:type", String)
], DriverBalanceRowDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], DriverBalanceRowDto.prototype, "employeeId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Staff username / staff ID' }),
    __metadata("design:type", String)
], DriverBalanceRowDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Display name' }),
    __metadata("design:type", String)
], DriverBalanceRowDto.prototype, "fullName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], DriverBalanceRowDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        format: 'uuid',
        nullable: true,
        description: 'Current OPEN shift (started at login), if any',
    }),
    __metadata("design:type", Object)
], DriverBalanceRowDto.prototype, "currentShiftId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        description: 'When the open shift started',
    }),
    __metadata("design:type", Object)
], DriverBalanceRowDto.prototype, "shiftStartedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Sum of COMPLETED orders with cash still with driver (PAID_TO_DRIVER)',
    }),
    __metadata("design:type", String)
], DriverBalanceRowDto.prototype, "heldCashTotal", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Number of such orders included in heldCashTotal',
    }),
    __metadata("design:type", Number)
], DriverBalanceRowDto.prototype, "pendingSettlementOrderCount", void 0);
class DriverBalanceResponseDto {
    drivers;
}
exports.DriverBalanceResponseDto = DriverBalanceResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [DriverBalanceRowDto] }),
    __metadata("design:type", Array)
], DriverBalanceResponseDto.prototype, "drivers", void 0);
class HandoverResultDto {
    settledOrderCount;
    systemHandoverTotal;
    shiftId;
}
exports.HandoverResultDto = HandoverResultDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], HandoverResultDto.prototype, "settledOrderCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Exact ledger amount moved to HANDED_OVER_TO_OFFICE',
    }),
    __metadata("design:type", String)
], HandoverResultDto.prototype, "systemHandoverTotal", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'uuid' }),
    __metadata("design:type", String)
], HandoverResultDto.prototype, "shiftId", void 0);
//# sourceMappingURL=driver-balance.dto.js.map