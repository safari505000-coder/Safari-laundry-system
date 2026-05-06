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
exports.OutstandingResponseDto = exports.OutstandingRowDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
class OutstandingRowDto {
    customerId;
    name;
    phone;
    phone2;
    driverId;
    driverName;
    totalDueKd;
    invoicesCount;
    lastOrderAt;
    earliestDueDate;
    daysLate;
    priorityScore;
    status;
    blocked;
    note;
}
exports.OutstandingRowDto = OutstandingRowDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OutstandingRowDto.prototype, "customerId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", Object)
], OutstandingRowDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OutstandingRowDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", Object)
], OutstandingRowDto.prototype, "phone2", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", Object)
], OutstandingRowDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", Object)
], OutstandingRowDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Sum of `Order.totalPrice` over Collections-scope receivable orders (UNPAID + open FIFO debt-on-account), same predicate as the red KPI.',
    }),
    __metadata("design:type", Number)
], OutstandingRowDto.prototype, "totalDueKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Count of open invoices for this customer.' }),
    __metadata("design:type", Number)
], OutstandingRowDto.prototype, "invoicesCount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'ISO timestamp of the most recent open invoice.',
    }),
    __metadata("design:type", Object)
], OutstandingRowDto.prototype, "lastOrderAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Earliest dueDate among the open invoices, if any.',
    }),
    __metadata("design:type", Object)
], OutstandingRowDto.prototype, "earliestDueDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Days late based on the earliest dueDate among open invoices. 0 when no dueDate is set.',
    }),
    __metadata("design:type", Number)
], OutstandingRowDto.prototype, "daysLate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Suggested call-priority score: totalDueKd * 0.6 + daysLate * 0.4. NEVER triggers automation.',
    }),
    __metadata("design:type", Number)
], OutstandingRowDto.prototype, "priorityScore", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.CustomerCollectionStatusKind }),
    __metadata("design:type", String)
], OutstandingRowDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], OutstandingRowDto.prototype, "blocked", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", Object)
], OutstandingRowDto.prototype, "note", void 0);
class OutstandingResponseDto {
    rows;
    totalCustomers;
    totalInvoices;
    totalDueKd;
    source;
    blockedCount;
    lateCount;
    riskCount;
    generatedAt;
    fromIso;
    toIso;
}
exports.OutstandingResponseDto = OutstandingResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [OutstandingRowDto] }),
    __metadata("design:type", Array)
], OutstandingResponseDto.prototype, "rows", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], OutstandingResponseDto.prototype, "totalCustomers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], OutstandingResponseDto.prototype, "totalInvoices", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Canonical AR headline total. Always sourced from OrdersService.sumCollectionsDebtTotalKd().',
        example: '3.250',
    }),
    __metadata("design:type", String)
], OutstandingResponseDto.prototype, "totalDueKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ['COLLECTIONS_ENGINE'],
        description: 'Financial source lock for the headline AR total.',
    }),
    __metadata("design:type", String)
], OutstandingResponseDto.prototype, "source", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], OutstandingResponseDto.prototype, "blockedCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], OutstandingResponseDto.prototype, "lateCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], OutstandingResponseDto.prototype, "riskCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OutstandingResponseDto.prototype, "generatedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OutstandingResponseDto.prototype, "fromIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OutstandingResponseDto.prototype, "toIso", void 0);
//# sourceMappingURL=outstanding-row.dto.js.map