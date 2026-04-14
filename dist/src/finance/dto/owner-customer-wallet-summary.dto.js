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
//# sourceMappingURL=owner-customer-wallet-summary.dto.js.map