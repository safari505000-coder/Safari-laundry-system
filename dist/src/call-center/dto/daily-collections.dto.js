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
exports.DailyCollectionsResponseDto = exports.DailyCollectionsAgentTotalsDto = exports.DailyCollectionEventDto = exports.DailyCollectionsQueryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
class DailyCollectionsQueryDto {
    date;
    agentId;
}
exports.DailyCollectionsQueryDto = DailyCollectionsQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: '2026-04-19',
        description: 'Kuwait-local day (YYYY-MM-DD). Omit for today. Window is always [00:00, 24:00) Kuwait.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(ISO_DATE, { message: 'date must be YYYY-MM-DD' }),
    __metadata("design:type", String)
], DailyCollectionsQueryDto.prototype, "date", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter to a single CC agent / collector.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], DailyCollectionsQueryDto.prototype, "agentId", void 0);
class DailyCollectionEventDto {
    id;
    atIso;
    customerId;
    customerName;
    customerPhone;
    orderId;
    orderSerial;
    amountCollectedKd;
    discountAppliedKd;
    paymentMethod;
    kind;
    performedByUserId;
    performedByName;
    performedByRole;
    branchName;
    driverName;
    note;
    customerDebtAfterKd;
}
exports.DailyCollectionEventDto = DailyCollectionEventDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DailyCollectionEventDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DailyCollectionEventDto.prototype, "atIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DailyCollectionEventDto.prototype, "customerId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], DailyCollectionEventDto.prototype, "customerName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], DailyCollectionEventDto.prototype, "customerPhone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], DailyCollectionEventDto.prototype, "orderId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], DailyCollectionEventDto.prototype, "orderSerial", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '1.5000' }),
    __metadata("design:type", String)
], DailyCollectionEventDto.prototype, "amountCollectedKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '0.0000' }),
    __metadata("design:type", String)
], DailyCollectionEventDto.prototype, "discountAppliedKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.PosPaymentMethod, nullable: true }),
    __metadata("design:type", Object)
], DailyCollectionEventDto.prototype, "paymentMethod", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ['PARTIAL_DEBT_PAYMENT', 'FULL_ORDER_SETTLEMENT'],
        description: 'PARTIAL_DEBT_PAYMENT = customer-level debt reduction with optional discount (CC #1). FULL_ORDER_SETTLEMENT = an unpaid order was marked paid and the cash was collected in a single shot.',
    }),
    __metadata("design:type", String)
], DailyCollectionEventDto.prototype, "kind", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], DailyCollectionEventDto.prototype, "performedByUserId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], DailyCollectionEventDto.prototype, "performedByName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, enum: client_1.SafariRole }),
    __metadata("design:type", Object)
], DailyCollectionEventDto.prototype, "performedByRole", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], DailyCollectionEventDto.prototype, "branchName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], DailyCollectionEventDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], DailyCollectionEventDto.prototype, "note", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2.5000' }),
    __metadata("design:type", String)
], DailyCollectionEventDto.prototype, "customerDebtAfterKd", void 0);
class DailyCollectionsAgentTotalsDto {
    agentId;
    agentName;
    agentRole;
    eventCount;
    uniqueCustomers;
    collectedKd;
    discountKd;
}
exports.DailyCollectionsAgentTotalsDto = DailyCollectionsAgentTotalsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], DailyCollectionsAgentTotalsDto.prototype, "agentId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], DailyCollectionsAgentTotalsDto.prototype, "agentName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, enum: client_1.SafariRole }),
    __metadata("design:type", Object)
], DailyCollectionsAgentTotalsDto.prototype, "agentRole", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], DailyCollectionsAgentTotalsDto.prototype, "eventCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], DailyCollectionsAgentTotalsDto.prototype, "uniqueCustomers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DailyCollectionsAgentTotalsDto.prototype, "collectedKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DailyCollectionsAgentTotalsDto.prototype, "discountKd", void 0);
class DailyCollectionsResponseDto {
    dayIsoLocal;
    dayStartIso;
    dayEndIso;
    totals;
    byAgent;
    events;
}
exports.DailyCollectionsResponseDto = DailyCollectionsResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-04-19' }),
    __metadata("design:type", String)
], DailyCollectionsResponseDto.prototype, "dayIsoLocal", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DailyCollectionsResponseDto.prototype, "dayStartIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DailyCollectionsResponseDto.prototype, "dayEndIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Aggregate totals across all collectors for the selected day.',
    }),
    __metadata("design:type", Object)
], DailyCollectionsResponseDto.prototype, "totals", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [DailyCollectionsAgentTotalsDto] }),
    __metadata("design:type", Array)
], DailyCollectionsResponseDto.prototype, "byAgent", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [DailyCollectionEventDto] }),
    __metadata("design:type", Array)
], DailyCollectionsResponseDto.prototype, "events", void 0);
//# sourceMappingURL=daily-collections.dto.js.map