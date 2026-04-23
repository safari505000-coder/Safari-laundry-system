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
exports.DriverCashTraceResponseDto = exports.DriverCashTraceRangeDto = exports.DriverCashTraceKpisDto = exports.DriverCashTraceDriverDto = exports.DriverCashTraceBagDto = exports.DriverCashTraceQueryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class DriverCashTraceQueryDto {
    from;
    to;
    driverId;
    branchId;
}
exports.DriverCashTraceQueryDto = DriverCashTraceQueryDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Inclusive lower bound of the reporting window (ISO-8601).',
        example: '2026-04-21T00:00:00.000Z',
    }),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], DriverCashTraceQueryDto.prototype, "from", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Inclusive upper bound of the reporting window (ISO-8601).',
        example: '2026-04-21T23:59:59.999Z',
    }),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], DriverCashTraceQueryDto.prototype, "to", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        format: 'uuid',
        description: 'Optional: scope the report to a single driver.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], DriverCashTraceQueryDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        format: 'uuid',
        description: 'Optional: scope the report to a single branch.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], DriverCashTraceQueryDto.prototype, "branchId", void 0);
class DriverCashTraceBagDto {
    id;
    amountKd;
    settledOrderCount;
    status;
    managerId;
    managerName;
    managerUsername;
    branchId;
    branchName;
    receivedFromDriverAt;
    slipUploadedAt;
    verifiedAt;
    rejectedAt;
    rejectionReason;
}
exports.DriverCashTraceBagDto = DriverCashTraceBagDto;
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'uuid' }),
    __metadata("design:type", String)
], DriverCashTraceBagDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Cash in the bag (KWD, fixed-4).' }),
    __metadata("design:type", String)
], DriverCashTraceBagDto.prototype, "amountKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'How many COD orders the bag settled.' }),
    __metadata("design:type", Number)
], DriverCashTraceBagDto.prototype, "settledOrderCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Current lifecycle state of the bag.',
        enum: [
            'PENDING_DEPOSIT',
            'AWAITING_VERIFICATION',
            'VERIFIED',
            'REJECTED',
        ],
    }),
    __metadata("design:type", String)
], DriverCashTraceBagDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ format: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], DriverCashTraceBagDto.prototype, "managerId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], DriverCashTraceBagDto.prototype, "managerName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], DriverCashTraceBagDto.prototype, "managerUsername", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ format: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], DriverCashTraceBagDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], DriverCashTraceBagDto.prototype, "branchName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'date-time' }),
    __metadata("design:type", String)
], DriverCashTraceBagDto.prototype, "receivedFromDriverAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ format: 'date-time', nullable: true }),
    __metadata("design:type", Object)
], DriverCashTraceBagDto.prototype, "slipUploadedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ format: 'date-time', nullable: true }),
    __metadata("design:type", Object)
], DriverCashTraceBagDto.prototype, "verifiedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ format: 'date-time', nullable: true }),
    __metadata("design:type", Object)
], DriverCashTraceBagDto.prototype, "rejectedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], DriverCashTraceBagDto.prototype, "rejectionReason", void 0);
class DriverCashTraceDriverDto {
    driverId;
    username;
    fullName;
    branchId;
    branchName;
    collectedKd;
    collectedOrderCount;
    handedToManagerKd;
    handedToManagerBagCount;
    pendingWithDriverKd;
    atBankKd;
    pendingAtManagerKd;
    awaitingVerificationKd;
    rejectedKd;
    bags;
}
exports.DriverCashTraceDriverDto = DriverCashTraceDriverDto;
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'uuid' }),
    __metadata("design:type", String)
], DriverCashTraceDriverDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DriverCashTraceDriverDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DriverCashTraceDriverDto.prototype, "fullName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], DriverCashTraceDriverDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], DriverCashTraceDriverDto.prototype, "branchName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Cash collected in window (KWD).' }),
    __metadata("design:type", String)
], DriverCashTraceDriverDto.prototype, "collectedKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'COD orders contributing to the above.' }),
    __metadata("design:type", Number)
], DriverCashTraceDriverDto.prototype, "collectedOrderCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Cash handed to a branch manager in window.' }),
    __metadata("design:type", String)
], DriverCashTraceDriverDto.prototype, "handedToManagerKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of custody bags in window.' }),
    __metadata("design:type", Number)
], DriverCashTraceDriverDto.prototype, "handedToManagerBagCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'max(0, collectedKd - handedToManagerKd). What the driver still physically holds.',
    }),
    __metadata("design:type", String)
], DriverCashTraceDriverDto.prototype, "pendingWithDriverKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Bag sum VERIFIED by accountant (at bank).' }),
    __metadata("design:type", String)
], DriverCashTraceDriverDto.prototype, "atBankKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Bag sum PENDING_DEPOSIT (manager has it, no slip yet).',
    }),
    __metadata("design:type", String)
], DriverCashTraceDriverDto.prototype, "pendingAtManagerKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Bag sum AWAITING_VERIFICATION (slip uploaded, accountant pending).',
    }),
    __metadata("design:type", String)
], DriverCashTraceDriverDto.prototype, "awaitingVerificationKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Bag sum REJECTED by accountant.' }),
    __metadata("design:type", String)
], DriverCashTraceDriverDto.prototype, "rejectedKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [DriverCashTraceBagDto] }),
    __metadata("design:type", Array)
], DriverCashTraceDriverDto.prototype, "bags", void 0);
class DriverCashTraceKpisDto {
    totalCollectedKd;
    totalHandedToManagerKd;
    totalAtBankKd;
    totalPendingWithDriverKd;
    totalPendingAtManagerKd;
    totalAwaitingVerificationKd;
    totalRejectedKd;
    totalCollectedOrderCount;
    totalBagCount;
}
exports.DriverCashTraceKpisDto = DriverCashTraceKpisDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DriverCashTraceKpisDto.prototype, "totalCollectedKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DriverCashTraceKpisDto.prototype, "totalHandedToManagerKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DriverCashTraceKpisDto.prototype, "totalAtBankKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DriverCashTraceKpisDto.prototype, "totalPendingWithDriverKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DriverCashTraceKpisDto.prototype, "totalPendingAtManagerKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DriverCashTraceKpisDto.prototype, "totalAwaitingVerificationKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DriverCashTraceKpisDto.prototype, "totalRejectedKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], DriverCashTraceKpisDto.prototype, "totalCollectedOrderCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], DriverCashTraceKpisDto.prototype, "totalBagCount", void 0);
class DriverCashTraceRangeDto {
    from;
    to;
}
exports.DriverCashTraceRangeDto = DriverCashTraceRangeDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DriverCashTraceRangeDto.prototype, "from", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DriverCashTraceRangeDto.prototype, "to", void 0);
class DriverCashTraceResponseDto {
    range;
    kpis;
    drivers;
}
exports.DriverCashTraceResponseDto = DriverCashTraceResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: DriverCashTraceRangeDto }),
    __metadata("design:type", DriverCashTraceRangeDto)
], DriverCashTraceResponseDto.prototype, "range", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: DriverCashTraceKpisDto }),
    __metadata("design:type", DriverCashTraceKpisDto)
], DriverCashTraceResponseDto.prototype, "kpis", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [DriverCashTraceDriverDto] }),
    __metadata("design:type", Array)
], DriverCashTraceResponseDto.prototype, "drivers", void 0);
//# sourceMappingURL=driver-cash-trace.dto.js.map