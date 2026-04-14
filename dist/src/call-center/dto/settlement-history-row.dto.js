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
exports.SettlementHistoryRowDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
class SettlementHistoryRowDto {
    id;
    createdAt;
    type;
    totalCollected;
    debtSettled;
    creditedToBalance;
    balanceAfter;
    debtAfter;
    planName;
    orderId;
}
exports.SettlementHistoryRowDto = SettlementHistoryRowDto;
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'uuid' }),
    __metadata("design:type", String)
], SettlementHistoryRowDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Date)
], SettlementHistoryRowDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.LedgerTransactionType }),
    __metadata("design:type", String)
], SettlementHistoryRowDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Cash collected (subscription), if applicable',
    }),
    __metadata("design:type", String)
], SettlementHistoryRowDto.prototype, "totalCollected", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Amount applied to customer debt' }),
    __metadata("design:type", String)
], SettlementHistoryRowDto.prototype, "debtSettled", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Net amount credited to prepaid balance' }),
    __metadata("design:type", String)
], SettlementHistoryRowDto.prototype, "creditedToBalance", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], SettlementHistoryRowDto.prototype, "balanceAfter", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], SettlementHistoryRowDto.prototype, "debtAfter", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", String)
], SettlementHistoryRowDto.prototype, "planName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ format: 'uuid' }),
    __metadata("design:type", String)
], SettlementHistoryRowDto.prototype, "orderId", void 0);
//# sourceMappingURL=settlement-history-row.dto.js.map