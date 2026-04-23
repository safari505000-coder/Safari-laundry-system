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
exports.OwnerCustomerWalletSummaryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class OwnerCustomerWalletSummaryDto {
    totalWalletLiabilities;
    totalCustomerDebts;
    debtFromIssuedInvoices;
    debtFromSubscriptionOveruse;
    debtSettledBySubscriptions;
    debtByBranch;
    debtByDriver;
    debtByOwner;
    debtByCallCenter;
    totalSubscriptionUsage;
}
exports.OwnerCustomerWalletSummaryDto = OwnerCustomerWalletSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Sum of all customer wallet balances (outstanding prepaid credit / liabilities)',
        example: '1250.5000',
    }),
    __metadata("design:type", String)
], OwnerCustomerWalletSummaryDto.prototype, "totalWalletLiabilities", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Sum of all customer wallet debt (amounts owed beyond credit)',
        example: '42.0000',
    }),
    __metadata("design:type", String)
], OwnerCustomerWalletSummaryDto.prototype, "totalCustomerDebts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Cumulative debt additions sourced from issued invoices (ORDER_WALLET_SETTLEMENT.addedToDebt)',
        example: '18.5000',
    }),
    __metadata("design:type", String)
], OwnerCustomerWalletSummaryDto.prototype, "debtFromIssuedInvoices", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Cumulative debt additions sourced from subscription overuse (negative subscription balance)',
        example: '5.0000',
    }),
    __metadata("design:type", String)
], OwnerCustomerWalletSummaryDto.prototype, "debtFromSubscriptionOveruse", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Cumulative debt settled by subscription activations (SUBSCRIPTION_ACTIVATION.debtSettled)',
        example: '7.0000',
    }),
    __metadata("design:type", String)
], OwnerCustomerWalletSummaryDto.prototype, "debtSettledBySubscriptions", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '4.2500' }),
    __metadata("design:type", String)
], OwnerCustomerWalletSummaryDto.prototype, "debtByBranch", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '8.0000' }),
    __metadata("design:type", String)
], OwnerCustomerWalletSummaryDto.prototype, "debtByDriver", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '1.5000' }),
    __metadata("design:type", String)
], OwnerCustomerWalletSummaryDto.prototype, "debtByOwner", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2.7500' }),
    __metadata("design:type", String)
], OwnerCustomerWalletSummaryDto.prototype, "debtByCallCenter", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Cumulative subscription wallet consumption from completed subscription-backed orders',
        example: '64.2500',
    }),
    __metadata("design:type", String)
], OwnerCustomerWalletSummaryDto.prototype, "totalSubscriptionUsage", void 0);
//# sourceMappingURL=owner-customer-wallet-summary.dto.js.map