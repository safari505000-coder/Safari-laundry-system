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
exports.ControlTowerResponseDto = exports.ControlTowerMetaDto = exports.ControlTowerRowDto = exports.ControlTowerDriverWorkloadDto = exports.ControlTowerKpisDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const control_tower_query_dto_1 = require("./control-tower-query.dto");
class ControlTowerKpisDto {
    totalDue;
    customersWithDebt;
    lateCustomers;
    riskCustomers;
    activeDispatches;
    slaBreached;
}
exports.ControlTowerKpisDto = ControlTowerKpisDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Σ unpaid invoice totals (KWD).' }),
    __metadata("design:type", Number)
], ControlTowerKpisDto.prototype, "totalDue", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Distinct customers with ≥1 qualifying unpaid invoice.',
    }),
    __metadata("design:type", Number)
], ControlTowerKpisDto.prototype, "customersWithDebt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Customers classified late for KPIs: collection `LATE` OR invoice-derived daysLate ≥ 3.',
    }),
    __metadata("design:type", Number)
], ControlTowerKpisDto.prototype, "lateCustomers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Customers with collection status `RISK`.',
    }),
    __metadata("design:type", Number)
], ControlTowerKpisDto.prototype, "riskCustomers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'System-wide open dispatches (`ASSIGNED` or `IN_PROGRESS`) — operational visibility.',
    }),
    __metadata("design:type", Number)
], ControlTowerKpisDto.prototype, "activeDispatches", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Subset of active dispatches whose computed SLA tier is `BREACHED`.',
    }),
    __metadata("design:type", Number)
], ControlTowerKpisDto.prototype, "slaBreached", void 0);
class ControlTowerDriverWorkloadDto {
    driverId;
    name;
    assigned;
    inProgress;
    late;
}
exports.ControlTowerDriverWorkloadDto = ControlTowerDriverWorkloadDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Driver user UUID.' }),
    __metadata("design:type", String)
], ControlTowerDriverWorkloadDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ControlTowerDriverWorkloadDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Open dispatches in ASSIGNED.' }),
    __metadata("design:type", Number)
], ControlTowerDriverWorkloadDto.prototype, "assigned", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Open dispatches in IN_PROGRESS.' }),
    __metadata("design:type", Number)
], ControlTowerDriverWorkloadDto.prototype, "inProgress", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Open dispatches where SLA ∉ { OK } (LATE, ESCALATED, or BREACHED).',
    }),
    __metadata("design:type", Number)
], ControlTowerDriverWorkloadDto.prototype, "late", void 0);
class ControlTowerRowDto {
    customerId;
    customerName;
    phone;
    driverName;
    totalDue;
    invoicesCount;
    daysLate;
    riskLevel;
    hasActiveDispatch;
    dispatchStatus;
    slaStatus;
    blocked;
}
exports.ControlTowerRowDto = ControlTowerRowDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Customer UUID.' }),
    __metadata("design:type", String)
], ControlTowerRowDto.prototype, "customerId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ControlTowerRowDto.prototype, "customerName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ControlTowerRowDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Display driver name for context row.' }),
    __metadata("design:type", String)
], ControlTowerRowDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Σ unpaid qualifying invoices (KWD).' }),
    __metadata("design:type", Number)
], ControlTowerRowDto.prototype, "totalDue", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ControlTowerRowDto.prototype, "invoicesCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Whole days late from earliest invoice dueDate else earliest createdAt anchor.',
    }),
    __metadata("design:type", Number)
], ControlTowerRowDto.prototype, "daysLate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['NORMAL', 'LATE', 'RISK'] }),
    __metadata("design:type", String)
], ControlTowerRowDto.prototype, "riskLevel", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Whether customer has an ASSIGNED or IN_PROGRESS dispatch.',
    }),
    __metadata("design:type", Boolean)
], ControlTowerRowDto.prototype, "hasActiveDispatch", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        nullable: true,
        enum: ['ASSIGNED', 'IN_PROGRESS'],
        description: 'Active dispatch status when present.',
    }),
    __metadata("design:type", Object)
], ControlTowerRowDto.prototype, "dispatchStatus", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['OK', 'LATE', 'ESCALATED', 'BREACHED'] }),
    __metadata("design:type", String)
], ControlTowerRowDto.prototype, "slaStatus", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Manual AR block toggle (`CustomerCollectionStatus.blocked`) — never auto-set.',
    }),
    __metadata("design:type", Boolean)
], ControlTowerRowDto.prototype, "blocked", void 0);
class ControlTowerMetaDto {
    preset;
    generatedAt;
    windowFromIso;
    windowToIso;
}
exports.ControlTowerMetaDto = ControlTowerMetaDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: control_tower_query_dto_1.ControlTowerPreset }),
    __metadata("design:type", String)
], ControlTowerMetaDto.prototype, "preset", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ISO projection timestamp.' }),
    __metadata("design:type", String)
], ControlTowerMetaDto.prototype, "generatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        description: 'Resolved lower bound on `Order.createdAt` filter.',
    }),
    __metadata("design:type", Object)
], ControlTowerMetaDto.prototype, "windowFromIso", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        description: 'Resolved upper bound on `Order.createdAt` filter.',
    }),
    __metadata("design:type", Object)
], ControlTowerMetaDto.prototype, "windowToIso", void 0);
class ControlTowerResponseDto {
    kpis;
    drivers;
    rows;
    meta;
}
exports.ControlTowerResponseDto = ControlTowerResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: ControlTowerKpisDto }),
    __metadata("design:type", ControlTowerKpisDto)
], ControlTowerResponseDto.prototype, "kpis", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [ControlTowerDriverWorkloadDto] }),
    __metadata("design:type", Array)
], ControlTowerResponseDto.prototype, "drivers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [ControlTowerRowDto] }),
    __metadata("design:type", Array)
], ControlTowerResponseDto.prototype, "rows", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: ControlTowerMetaDto }),
    __metadata("design:type", ControlTowerMetaDto)
], ControlTowerResponseDto.prototype, "meta", void 0);
//# sourceMappingURL=control-tower-response.dto.js.map