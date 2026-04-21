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
exports.UnpaidInvoicesResponseDto = exports.UnpaidInvoicesKpisDto = exports.UnpaidInvoiceRowDto = exports.UnpaidInvoicesQueryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class UnpaidInvoicesQueryDto {
    from;
    to;
    branchId;
    actorUserId;
    customerPhone;
}
exports.UnpaidInvoicesQueryDto = UnpaidInvoicesQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Inclusive lower bound of the debt-creation window (ISO-8601). Filters DebtLedgerEntry.createdAt.',
        example: '2026-01-01T00:00:00.000Z',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], UnpaidInvoicesQueryDto.prototype, "from", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Inclusive upper bound of the debt-creation window (ISO-8601).',
        example: '2026-04-22T23:59:59.999Z',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], UnpaidInvoicesQueryDto.prototype, "to", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        format: 'uuid',
        description: 'Branch that issued the invoice.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], UnpaidInvoicesQueryDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        format: 'uuid',
        description: 'Employee (driver / branch manager) that issued the invoice.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], UnpaidInvoicesQueryDto.prototype, "actorUserId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Customer phone substring (digits only, primary or secondary).',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(32),
    __metadata("design:type", String)
], UnpaidInvoicesQueryDto.prototype, "customerPhone", void 0);
class UnpaidInvoiceRowDto {
    orderId;
    serialNumber;
    invoiceNumber;
    issuedAt;
    customerId;
    customerName;
    customerPhone;
    customerPhone2;
    branchId;
    branchName;
    actorUserId;
    actorUserName;
    actorUserRole;
    invoiceTotalKd;
    debtAmountKd;
    entryCount;
    currentCustomerDebtKd;
    isOpen;
    lastEntryAt;
}
exports.UnpaidInvoiceRowDto = UnpaidInvoiceRowDto;
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'uuid' }),
    __metadata("design:type", String)
], UnpaidInvoiceRowDto.prototype, "orderId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], UnpaidInvoiceRowDto.prototype, "serialNumber", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], UnpaidInvoiceRowDto.prototype, "invoiceNumber", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'date-time' }),
    __metadata("design:type", String)
], UnpaidInvoiceRowDto.prototype, "issuedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'uuid' }),
    __metadata("design:type", String)
], UnpaidInvoiceRowDto.prototype, "customerId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], UnpaidInvoiceRowDto.prototype, "customerName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], UnpaidInvoiceRowDto.prototype, "customerPhone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], UnpaidInvoiceRowDto.prototype, "customerPhone2", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ format: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], UnpaidInvoiceRowDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], UnpaidInvoiceRowDto.prototype, "branchName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ format: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], UnpaidInvoiceRowDto.prototype, "actorUserId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], UnpaidInvoiceRowDto.prototype, "actorUserName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        enum: [
            'OWNER',
            'GENERAL_MANAGER',
            'MANAGER',
            'ACCOUNTANT',
            'SUPERVISOR',
            'DRIVER',
            'CALL_CENTER',
            'CALL_CENTER_SUPERVISOR',
            'FLEET_SUPERVISOR',
            'VIEWER',
        ],
    }),
    __metadata("design:type", Object)
], UnpaidInvoiceRowDto.prototype, "actorUserRole", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Invoice total (KWD, fixed-4).' }),
    __metadata("design:type", String)
], UnpaidInvoiceRowDto.prototype, "invoiceTotalKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Sum of DebtLedgerEntry.amount for this invoice (KWD).',
    }),
    __metadata("design:type", String)
], UnpaidInvoiceRowDto.prototype, "debtAmountKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Number of DebtLedgerEntry rows rolled into this invoice.',
    }),
    __metadata("design:type", Number)
], UnpaidInvoiceRowDto.prototype, "entryCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: "Customer's current open wallet debt (KWD, fixed-4).",
    }),
    __metadata("design:type", String)
], UnpaidInvoiceRowDto.prototype, "currentCustomerDebtKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '`true` when the customer still has open debt (wallet.debt > 0 OR wallet.balance < 0).',
    }),
    __metadata("design:type", Boolean)
], UnpaidInvoiceRowDto.prototype, "isOpen", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ format: 'date-time' }),
    __metadata("design:type", String)
], UnpaidInvoiceRowDto.prototype, "lastEntryAt", void 0);
class UnpaidInvoicesKpisDto {
    invoiceCount;
    openInvoiceCount;
    customerCount;
    openCustomerCount;
    totalDebtKd;
    openDebtKd;
    avgDebtPerInvoiceKd;
}
exports.UnpaidInvoicesKpisDto = UnpaidInvoicesKpisDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], UnpaidInvoicesKpisDto.prototype, "invoiceCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], UnpaidInvoicesKpisDto.prototype, "openInvoiceCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], UnpaidInvoicesKpisDto.prototype, "customerCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], UnpaidInvoicesKpisDto.prototype, "openCustomerCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], UnpaidInvoicesKpisDto.prototype, "totalDebtKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], UnpaidInvoicesKpisDto.prototype, "openDebtKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], UnpaidInvoicesKpisDto.prototype, "avgDebtPerInvoiceKd", void 0);
class UnpaidInvoicesResponseDto {
    from;
    to;
    kpis;
    rows;
}
exports.UnpaidInvoicesResponseDto = UnpaidInvoicesResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'date-time', nullable: true }),
    __metadata("design:type", Object)
], UnpaidInvoicesResponseDto.prototype, "from", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'date-time', nullable: true }),
    __metadata("design:type", Object)
], UnpaidInvoicesResponseDto.prototype, "to", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: UnpaidInvoicesKpisDto }),
    __metadata("design:type", UnpaidInvoicesKpisDto)
], UnpaidInvoicesResponseDto.prototype, "kpis", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [UnpaidInvoiceRowDto] }),
    __metadata("design:type", Array)
], UnpaidInvoicesResponseDto.prototype, "rows", void 0);
//# sourceMappingURL=unpaid-invoices.dto.js.map