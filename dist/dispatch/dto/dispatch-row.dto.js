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
exports.DispatchSnapshotDto = exports.DispatchRowDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class DispatchRowDto {
    id;
    status;
    severity;
    elapsedMinutes;
    customerId;
    customerDisplay;
    customerPhone;
    driverId;
    driverName;
    instructionNote;
    createdAtIso;
    completedAtIso;
    completedByOrderId;
}
exports.DispatchRowDto = DispatchRowDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '33333333-3333-3333-3333-333333333333' }),
    __metadata("design:type", String)
], DispatchRowDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['ASSIGNED', 'COMPLETED'] }),
    __metadata("design:type", String)
], DispatchRowDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Computed live from server clock; never persisted. Thresholds: <10m ON_TIME, ≥10m LATE, ≥20m CRITICAL. COMPLETED short-circuits.',
        enum: ['ON_TIME', 'LATE', 'CRITICAL', 'COMPLETED'],
    }),
    __metadata("design:type", String)
], DispatchRowDto.prototype, "severity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Whole minutes elapsed since createdAt (or since createdAt → completedAt for closed rows). Server-computed.',
    }),
    __metadata("design:type", Number)
], DispatchRowDto.prototype, "elapsedMinutes", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DispatchRowDto.prototype, "customerId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DispatchRowDto.prototype, "customerDisplay", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DispatchRowDto.prototype, "customerPhone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DispatchRowDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DispatchRowDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], DispatchRowDto.prototype, "instructionNote", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DispatchRowDto.prototype, "createdAtIso", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], DispatchRowDto.prototype, "completedAtIso", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], DispatchRowDto.prototype, "completedByOrderId", void 0);
class DispatchSnapshotDto {
    generatedAtIso;
    rows;
}
exports.DispatchSnapshotDto = DispatchSnapshotDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Server clock at projection time. Frontend MUST use this as the reference for all relative-time UI (≪ NOT new Date()).',
    }),
    __metadata("design:type", String)
], DispatchSnapshotDto.prototype, "generatedAtIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => [DispatchRowDto] }),
    __metadata("design:type", Array)
], DispatchSnapshotDto.prototype, "rows", void 0);
//# sourceMappingURL=dispatch-row.dto.js.map