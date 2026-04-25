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
exports.CustomerLedgerResponseDto = exports.CustomerLedgerFeedbackSummaryDto = exports.CustomerLedgerFeedbackLastDto = exports.CustomerLedgerInvoiceDto = exports.CustomerLedgerEventDto = exports.CustomerLedgerClosedInvoiceDto = exports.CustomerLedgerActivationBreakdownDto = exports.CustomerLedgerSubscriptionDto = exports.CustomerLedgerHeaderDto = exports.CustomerLedgerQueryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const client_1 = require("@prisma/client");
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
class CustomerLedgerQueryDto {
    from;
    to;
    limit;
    offset;
}
exports.CustomerLedgerQueryDto = CustomerLedgerQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-04-01' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(ISO_DATE, { message: 'from must be YYYY-MM-DD' }),
    __metadata("design:type", String)
], CustomerLedgerQueryDto.prototype, "from", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-04-18' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(ISO_DATE, { message: 'to must be YYYY-MM-DD' }),
    __metadata("design:type", String)
], CustomerLedgerQueryDto.prototype, "to", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 200, minimum: 1, maximum: 500 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => value === undefined || value === '' ? undefined : Number(value)),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(500),
    __metadata("design:type", Number)
], CustomerLedgerQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 0, minimum: 0 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => value === undefined || value === '' ? undefined : Number(value)),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CustomerLedgerQueryDto.prototype, "offset", void 0);
class CustomerLedgerHeaderDto {
    id;
    displayName;
    phone;
    phone2;
    originBranchId;
    originBranchName;
    walletBalanceKd;
    walletDebtKd;
}
exports.CustomerLedgerHeaderDto = CustomerLedgerHeaderDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CustomerLedgerHeaderDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerHeaderDto.prototype, "displayName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerHeaderDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerHeaderDto.prototype, "phone2", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerHeaderDto.prototype, "originBranchId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerHeaderDto.prototype, "originBranchName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '0.0000' }),
    __metadata("design:type", String)
], CustomerLedgerHeaderDto.prototype, "walletBalanceKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '0.0000' }),
    __metadata("design:type", String)
], CustomerLedgerHeaderDto.prototype, "walletDebtKd", void 0);
class CustomerLedgerSubscriptionDto {
    id;
    status;
    planNameSnapshot;
    planSalePriceKd;
    planActualBalanceKd;
    planValidityDays;
    carriedBalanceKd;
    parentSubscriptionId;
    activatedAtIso;
    expiresAtIso;
    closedAtIso;
    closedReason;
}
exports.CustomerLedgerSubscriptionDto = CustomerLedgerSubscriptionDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CustomerLedgerSubscriptionDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.CustomerSubscriptionStatus }),
    __metadata("design:type", String)
], CustomerLedgerSubscriptionDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CustomerLedgerSubscriptionDto.prototype, "planNameSnapshot", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CustomerLedgerSubscriptionDto.prototype, "planSalePriceKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CustomerLedgerSubscriptionDto.prototype, "planActualBalanceKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], CustomerLedgerSubscriptionDto.prototype, "planValidityDays", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CustomerLedgerSubscriptionDto.prototype, "carriedBalanceKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerSubscriptionDto.prototype, "parentSubscriptionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CustomerLedgerSubscriptionDto.prototype, "activatedAtIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CustomerLedgerSubscriptionDto.prototype, "expiresAtIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerSubscriptionDto.prototype, "closedAtIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerSubscriptionDto.prototype, "closedReason", void 0);
class CustomerLedgerActivationBreakdownDto {
    totalCollectedKd;
    actualBalanceKd;
    subsidyKd;
    debtSettledKd;
    creditedToBalanceKd;
    carriedBalanceKd;
}
exports.CustomerLedgerActivationBreakdownDto = CustomerLedgerActivationBreakdownDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '40.0000' }),
    __metadata("design:type", String)
], CustomerLedgerActivationBreakdownDto.prototype, "totalCollectedKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '60.0000' }),
    __metadata("design:type", String)
], CustomerLedgerActivationBreakdownDto.prototype, "actualBalanceKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '20.0000' }),
    __metadata("design:type", String)
], CustomerLedgerActivationBreakdownDto.prototype, "subsidyKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '60.0000' }),
    __metadata("design:type", String)
], CustomerLedgerActivationBreakdownDto.prototype, "debtSettledKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '0.0000' }),
    __metadata("design:type", String)
], CustomerLedgerActivationBreakdownDto.prototype, "creditedToBalanceKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '0.0000' }),
    __metadata("design:type", String)
], CustomerLedgerActivationBreakdownDto.prototype, "carriedBalanceKd", void 0);
class CustomerLedgerClosedInvoiceDto {
    id;
    serial;
    totalKd;
    createdAtIso;
}
exports.CustomerLedgerClosedInvoiceDto = CustomerLedgerClosedInvoiceDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CustomerLedgerClosedInvoiceDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerClosedInvoiceDto.prototype, "serial", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '0.6000' }),
    __metadata("design:type", String)
], CustomerLedgerClosedInvoiceDto.prototype, "totalKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CustomerLedgerClosedInvoiceDto.prototype, "createdAtIso", void 0);
class CustomerLedgerEventDto {
    id;
    atIso;
    rawType;
    kind;
    amountKd;
    balanceBeforeKd;
    balanceAfterKd;
    debtBeforeKd;
    debtAfterKd;
    debtSettledKd;
    debtDiscountKd;
    paymentMethod;
    orderId;
    orderSerial;
    subscriptionId;
    subscriptionLabel;
    performedByUserId;
    performedByName;
    performedByRole;
    note;
    activationBreakdown;
    closedInvoices;
}
exports.CustomerLedgerEventDto = CustomerLedgerEventDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CustomerLedgerEventDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CustomerLedgerEventDto.prototype, "atIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.LedgerTransactionType }),
    __metadata("design:type", String)
], CustomerLedgerEventDto.prototype, "rawType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: [
            'SUBSCRIPTION_ACTIVATION',
            'SUBSCRIPTION_ROLLOVER_CARRY',
            'ORDER_SETTLEMENT',
            'PARTIAL_DEBT_PAYMENT',
        ],
    }),
    __metadata("design:type", String)
], CustomerLedgerEventDto.prototype, "kind", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '1.5000' }),
    __metadata("design:type", String)
], CustomerLedgerEventDto.prototype, "amountKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '0.0000' }),
    __metadata("design:type", String)
], CustomerLedgerEventDto.prototype, "balanceBeforeKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '1.5000' }),
    __metadata("design:type", String)
], CustomerLedgerEventDto.prototype, "balanceAfterKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '0.0000' }),
    __metadata("design:type", String)
], CustomerLedgerEventDto.prototype, "debtBeforeKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '0.0000' }),
    __metadata("design:type", String)
], CustomerLedgerEventDto.prototype, "debtAfterKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '0.0000' }),
    __metadata("design:type", String)
], CustomerLedgerEventDto.prototype, "debtSettledKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '0.0000' }),
    __metadata("design:type", String)
], CustomerLedgerEventDto.prototype, "debtDiscountKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, enum: client_1.PosPaymentMethod }),
    __metadata("design:type", Object)
], CustomerLedgerEventDto.prototype, "paymentMethod", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerEventDto.prototype, "orderId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerEventDto.prototype, "orderSerial", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerEventDto.prototype, "subscriptionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerEventDto.prototype, "subscriptionLabel", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerEventDto.prototype, "performedByUserId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerEventDto.prototype, "performedByName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, enum: client_1.SafariRole }),
    __metadata("design:type", Object)
], CustomerLedgerEventDto.prototype, "performedByRole", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerEventDto.prototype, "note", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: CustomerLedgerActivationBreakdownDto,
        nullable: true,
    }),
    __metadata("design:type", Object)
], CustomerLedgerEventDto.prototype, "activationBreakdown", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [CustomerLedgerClosedInvoiceDto] }),
    __metadata("design:type", Array)
], CustomerLedgerEventDto.prototype, "closedInvoices", void 0);
class CustomerLedgerInvoiceDto {
    id;
    serial;
    createdAtIso;
    completedAtIso;
    totalKd;
    status;
    cashStatus;
    paymentMethod;
    driverName;
    branchName;
    subscriptionId;
    subscriptionStatus;
    subscriptionLabel;
    issuedWhileCutOff;
    openDebt;
    feedbackRating;
    feedbackSubmittedAtIso;
}
exports.CustomerLedgerInvoiceDto = CustomerLedgerInvoiceDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CustomerLedgerInvoiceDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerInvoiceDto.prototype, "serial", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CustomerLedgerInvoiceDto.prototype, "createdAtIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerInvoiceDto.prototype, "completedAtIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CustomerLedgerInvoiceDto.prototype, "totalKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.OrderStatus }),
    __metadata("design:type", String)
], CustomerLedgerInvoiceDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.CashStatus }),
    __metadata("design:type", String)
], CustomerLedgerInvoiceDto.prototype, "cashStatus", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, enum: client_1.PosPaymentMethod }),
    __metadata("design:type", Object)
], CustomerLedgerInvoiceDto.prototype, "paymentMethod", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerInvoiceDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerInvoiceDto.prototype, "branchName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerInvoiceDto.prototype, "subscriptionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, enum: client_1.CustomerSubscriptionStatus }),
    __metadata("design:type", Object)
], CustomerLedgerInvoiceDto.prototype, "subscriptionStatus", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerInvoiceDto.prototype, "subscriptionLabel", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'True if this invoice was issued while the customer was cut-off, based on the subscription snapshot associated with the invoice. Purely informational — the UI surfaces a "قطع" chip so agents can spot these fast.',
    }),
    __metadata("design:type", Boolean)
], CustomerLedgerInvoiceDto.prototype, "issuedWhileCutOff", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'True if the invoice still has money owed (UNPAID / PENDING-ish cash status and not CANCELED).',
    }),
    __metadata("design:type", Boolean)
], CustomerLedgerInvoiceDto.prototype, "openDebt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        nullable: true,
        description: '1..5 from customer feedback (QR / rating page) for this order.',
    }),
    __metadata("design:type", Object)
], CustomerLedgerInvoiceDto.prototype, "feedbackRating", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerInvoiceDto.prototype, "feedbackSubmittedAtIso", void 0);
class CustomerLedgerFeedbackLastDto {
    rating;
    note;
    submittedAtIso;
    orderId;
    orderSerial;
}
exports.CustomerLedgerFeedbackLastDto = CustomerLedgerFeedbackLastDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], CustomerLedgerFeedbackLastDto.prototype, "rating", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerFeedbackLastDto.prototype, "note", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CustomerLedgerFeedbackLastDto.prototype, "submittedAtIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CustomerLedgerFeedbackLastDto.prototype, "orderId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerFeedbackLastDto.prototype, "orderSerial", void 0);
class CustomerLedgerFeedbackSummaryDto {
    averageRating;
    ratedCount;
    lastFeedback;
}
exports.CustomerLedgerFeedbackSummaryDto = CustomerLedgerFeedbackSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, description: '1..5 average' }),
    __metadata("design:type", Object)
], CustomerLedgerFeedbackSummaryDto.prototype, "averageRating", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], CustomerLedgerFeedbackSummaryDto.prototype, "ratedCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: CustomerLedgerFeedbackLastDto, nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerFeedbackSummaryDto.prototype, "lastFeedback", void 0);
class CustomerLedgerResponseDto {
    customer;
    activeSubscription;
    isCutOff;
    fromIso;
    toIso;
    events;
    invoices;
    totals;
    feedbackSummary;
}
exports.CustomerLedgerResponseDto = CustomerLedgerResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: CustomerLedgerHeaderDto }),
    __metadata("design:type", CustomerLedgerHeaderDto)
], CustomerLedgerResponseDto.prototype, "customer", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: CustomerLedgerSubscriptionDto, nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerResponseDto.prototype, "activeSubscription", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'True when the most recent subscription for this customer is in CUT_OFF state. Drives the red banner on the customer 360 page.',
    }),
    __metadata("design:type", Boolean)
], CustomerLedgerResponseDto.prototype, "isCutOff", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerResponseDto.prototype, "fromIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], CustomerLedgerResponseDto.prototype, "toIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [CustomerLedgerEventDto] }),
    __metadata("design:type", Array)
], CustomerLedgerResponseDto.prototype, "events", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [CustomerLedgerInvoiceDto] }),
    __metadata("design:type", Array)
], CustomerLedgerResponseDto.prototype, "invoices", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Aggregate debt-settled / discount totals over the returned event window.',
    }),
    __metadata("design:type", Object)
], CustomerLedgerResponseDto.prototype, "totals", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: CustomerLedgerFeedbackSummaryDto }),
    __metadata("design:type", CustomerLedgerFeedbackSummaryDto)
], CustomerLedgerResponseDto.prototype, "feedbackSummary", void 0);
//# sourceMappingURL=customer-ledger.dto.js.map