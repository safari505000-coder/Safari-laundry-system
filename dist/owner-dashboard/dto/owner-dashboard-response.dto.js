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
exports.OwnerDashboardCacheResponseDto = exports.OwnerDashboardResponseDto = exports.OwnerDashboardAlertsDto = exports.OwnerDashboardQueuesDto = exports.OwnerDashboardOrdersDto = exports.OwnerDashboardPaymentsDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class OwnerDashboardPaymentsDto {
    successRate;
    successCount;
    failureCount;
}
exports.OwnerDashboardPaymentsDto = OwnerDashboardPaymentsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 99.2 }),
    __metadata("design:type", Number)
], OwnerDashboardPaymentsDto.prototype, "successRate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 124 }),
    __metadata("design:type", Number)
], OwnerDashboardPaymentsDto.prototype, "successCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1 }),
    __metadata("design:type", Number)
], OwnerDashboardPaymentsDto.prototype, "failureCount", void 0);
class OwnerDashboardOrdersDto {
    today;
    active;
}
exports.OwnerDashboardOrdersDto = OwnerDashboardOrdersDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 58 }),
    __metadata("design:type", Number)
], OwnerDashboardOrdersDto.prototype, "today", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 17 }),
    __metadata("design:type", Number)
], OwnerDashboardOrdersDto.prototype, "active", void 0);
class OwnerDashboardQueuesDto {
    waiting;
    failed;
}
exports.OwnerDashboardQueuesDto = OwnerDashboardQueuesDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 3 }),
    __metadata("design:type", Number)
], OwnerDashboardQueuesDto.prototype, "waiting", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 0 }),
    __metadata("design:type", Number)
], OwnerDashboardQueuesDto.prototype, "failed", void 0);
class OwnerDashboardAlertsDto {
    active;
    lastMessage;
}
exports.OwnerDashboardAlertsDto = OwnerDashboardAlertsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 0 }),
    __metadata("design:type", Number)
], OwnerDashboardAlertsDto.prototype, "active", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'All systems are operating normally.' }),
    __metadata("design:type", String)
], OwnerDashboardAlertsDto.prototype, "lastMessage", void 0);
class OwnerDashboardResponseDto {
    systemStatus;
    revenueToday;
    revenueThisMonth;
    payments;
    orders;
    queues;
    alerts;
}
exports.OwnerDashboardResponseDto = OwnerDashboardResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['healthy', 'warning', 'critical'], example: 'healthy' }),
    __metadata("design:type", String)
], OwnerDashboardResponseDto.prototype, "systemStatus", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1240.5 }),
    __metadata("design:type", Number)
], OwnerDashboardResponseDto.prototype, "revenueToday", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 28150.75 }),
    __metadata("design:type", Number)
], OwnerDashboardResponseDto.prototype, "revenueThisMonth", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: OwnerDashboardPaymentsDto }),
    __metadata("design:type", OwnerDashboardPaymentsDto)
], OwnerDashboardResponseDto.prototype, "payments", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: OwnerDashboardOrdersDto }),
    __metadata("design:type", OwnerDashboardOrdersDto)
], OwnerDashboardResponseDto.prototype, "orders", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: OwnerDashboardQueuesDto }),
    __metadata("design:type", OwnerDashboardQueuesDto)
], OwnerDashboardResponseDto.prototype, "queues", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: OwnerDashboardAlertsDto }),
    __metadata("design:type", OwnerDashboardAlertsDto)
], OwnerDashboardResponseDto.prototype, "alerts", void 0);
class OwnerDashboardCacheResponseDto {
    status;
    data;
    lastUpdated;
}
exports.OwnerDashboardCacheResponseDto = OwnerDashboardCacheResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['loading', 'ready', 'stale'], example: 'ready' }),
    __metadata("design:type", String)
], OwnerDashboardCacheResponseDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: OwnerDashboardResponseDto, nullable: true }),
    __metadata("design:type", Object)
], OwnerDashboardCacheResponseDto.prototype, "data", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-05-01T17:20:00.000Z', nullable: true }),
    __metadata("design:type", Object)
], OwnerDashboardCacheResponseDto.prototype, "lastUpdated", void 0);
//# sourceMappingURL=owner-dashboard-response.dto.js.map