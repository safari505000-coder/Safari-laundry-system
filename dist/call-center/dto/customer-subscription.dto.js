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
exports.CustomerSubscriptionRowDto = exports.SubscriptionInvoiceRowDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class SubscriptionInvoiceRowDto {
    orderId;
    invoiceNumber;
    totalPriceKd;
    status;
    cashStatus;
    createdAtIso;
    completedAtIso;
}
exports.SubscriptionInvoiceRowDto = SubscriptionInvoiceRowDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Order UUID (primary key of `Order`).' }),
    __metadata("design:type", String)
], SubscriptionInvoiceRowDto.prototype, "orderId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Paper invoice reference or serial, when present.',
    }),
    __metadata("design:type", String)
], SubscriptionInvoiceRowDto.prototype, "invoiceNumber", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total price (4-decimal KWD).', example: '2.5000' }),
    __metadata("design:type", String)
], SubscriptionInvoiceRowDto.prototype, "totalPriceKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Current order status (PENDING…COMPLETED, CANCELED).',
    }),
    __metadata("design:type", String)
], SubscriptionInvoiceRowDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Cash-custody status (UNPAID, PAID_TO_DRIVER, HANDED_OVER_TO_OFFICE).',
    }),
    __metadata("design:type", String)
], SubscriptionInvoiceRowDto.prototype, "cashStatus", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'When the order was created (ISO).' }),
    __metadata("design:type", String)
], SubscriptionInvoiceRowDto.prototype, "createdAtIso", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'When the order was completed (ISO).' }),
    __metadata("design:type", String)
], SubscriptionInvoiceRowDto.prototype, "completedAtIso", void 0);
class CustomerSubscriptionRowDto {
    id;
    status;
    planNameSnapshot;
    planSalePriceSnapshot;
    planActualBalanceSnapshot;
    planValidityDaysSnapshot;
    carriedBalanceKd;
    parentSubscriptionId;
    activatedAtIso;
    expiresAtIso;
    closedAtIso;
    closedReason;
    invoices;
}
exports.CustomerSubscriptionRowDto = CustomerSubscriptionRowDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'CustomerSubscription UUID.' }),
    __metadata("design:type", String)
], CustomerSubscriptionRowDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Lifecycle state: ACTIVE, EXPIRED, ROLLED_OVER, CUT_OFF, CANCELLED.',
    }),
    __metadata("design:type", String)
], CustomerSubscriptionRowDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Snapshot of the plan display name at activation.' }),
    __metadata("design:type", String)
], CustomerSubscriptionRowDto.prototype, "planNameSnapshot", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Snapshot of sale price (customer paid).' }),
    __metadata("design:type", String)
], CustomerSubscriptionRowDto.prototype, "planSalePriceSnapshot", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Snapshot of credit granted.' }),
    __metadata("design:type", String)
], CustomerSubscriptionRowDto.prototype, "planActualBalanceSnapshot", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Days valid at activation.' }),
    __metadata("design:type", Number)
], CustomerSubscriptionRowDto.prototype, "planValidityDaysSnapshot", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Signed carry-forward from the predecessor. +credit / -debt / 0 none.',
    }),
    __metadata("design:type", String)
], CustomerSubscriptionRowDto.prototype, "carriedBalanceKd", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Predecessor in the rollover chain (null on first activation).',
    }),
    __metadata("design:type", String)
], CustomerSubscriptionRowDto.prototype, "parentSubscriptionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Activation timestamp (ISO).' }),
    __metadata("design:type", String)
], CustomerSubscriptionRowDto.prototype, "activatedAtIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Expiry timestamp (ISO).' }),
    __metadata("design:type", String)
], CustomerSubscriptionRowDto.prototype, "expiresAtIso", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'When the row was closed (ROLLED_OVER / CUT_OFF / CANCELLED).',
    }),
    __metadata("design:type", String)
], CustomerSubscriptionRowDto.prototype, "closedAtIso", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Reason code for closure (free text).' }),
    __metadata("design:type", String)
], CustomerSubscriptionRowDto.prototype, "closedReason", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Invoices that were created while this subscription was ACTIVE. Order-by createdAt DESC.',
        type: [SubscriptionInvoiceRowDto],
    }),
    __metadata("design:type", Array)
], CustomerSubscriptionRowDto.prototype, "invoices", void 0);
//# sourceMappingURL=customer-subscription.dto.js.map