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
exports.LedgerReconciliationResponseDto = exports.LedgerReconciliationUnbalancedDto = exports.LedgerTransactionsResponseDto = exports.LedgerAccountResponseDto = exports.LedgerSummaryResponseDto = exports.LedgerAccountBalanceDto = exports.LedgerEntryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class LedgerEntryDto {
    id;
    txId;
    accountId;
    debit;
    credit;
    createdAt;
    meta;
}
exports.LedgerEntryDto = LedgerEntryDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerEntryDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerEntryDto.prototype, "txId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerEntryDto.prototype, "accountId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'KD, 4 decimal places. Either debit or credit is non-zero, never both.' }),
    __metadata("design:type", String)
], LedgerEntryDto.prototype, "debit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'KD, 4 decimal places.' }),
    __metadata("design:type", String)
], LedgerEntryDto.prototype, "credit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerEntryDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Object)
], LedgerEntryDto.prototype, "meta", void 0);
class LedgerAccountBalanceDto {
    accountId;
    totalDebit;
    totalCredit;
    balance;
    entryCount;
}
exports.LedgerAccountBalanceDto = LedgerAccountBalanceDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerAccountBalanceDto.prototype, "accountId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerAccountBalanceDto.prototype, "totalDebit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerAccountBalanceDto.prototype, "totalCredit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'SUM(debit) - SUM(credit). Sign-significant.' }),
    __metadata("design:type", String)
], LedgerAccountBalanceDto.prototype, "balance", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], LedgerAccountBalanceDto.prototype, "entryCount", void 0);
class LedgerSummaryResponseDto {
    source;
    fromIso;
    toIso;
    totalEntries;
    totalTransactions;
    globalDebit;
    globalCredit;
    accounts;
    generatedAt;
}
exports.LedgerSummaryResponseDto = LedgerSummaryResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerSummaryResponseDto.prototype, "source", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerSummaryResponseDto.prototype, "fromIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerSummaryResponseDto.prototype, "toIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], LedgerSummaryResponseDto.prototype, "totalEntries", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], LedgerSummaryResponseDto.prototype, "totalTransactions", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerSummaryResponseDto.prototype, "globalDebit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerSummaryResponseDto.prototype, "globalCredit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [LedgerAccountBalanceDto] }),
    __metadata("design:type", Array)
], LedgerSummaryResponseDto.prototype, "accounts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerSummaryResponseDto.prototype, "generatedAt", void 0);
class LedgerAccountResponseDto {
    source;
    accountId;
    fromIso;
    toIso;
    balance;
    entries;
    generatedAt;
}
exports.LedgerAccountResponseDto = LedgerAccountResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerAccountResponseDto.prototype, "source", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerAccountResponseDto.prototype, "accountId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerAccountResponseDto.prototype, "fromIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerAccountResponseDto.prototype, "toIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: LedgerAccountBalanceDto }),
    __metadata("design:type", LedgerAccountBalanceDto)
], LedgerAccountResponseDto.prototype, "balance", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [LedgerEntryDto] }),
    __metadata("design:type", Array)
], LedgerAccountResponseDto.prototype, "entries", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerAccountResponseDto.prototype, "generatedAt", void 0);
class LedgerTransactionsResponseDto {
    source;
    fromIso;
    toIso;
    totalEntries;
    entries;
    generatedAt;
}
exports.LedgerTransactionsResponseDto = LedgerTransactionsResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerTransactionsResponseDto.prototype, "source", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerTransactionsResponseDto.prototype, "fromIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerTransactionsResponseDto.prototype, "toIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], LedgerTransactionsResponseDto.prototype, "totalEntries", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [LedgerEntryDto] }),
    __metadata("design:type", Array)
], LedgerTransactionsResponseDto.prototype, "entries", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerTransactionsResponseDto.prototype, "generatedAt", void 0);
class LedgerReconciliationUnbalancedDto {
    txId;
    debit;
    credit;
    delta;
}
exports.LedgerReconciliationUnbalancedDto = LedgerReconciliationUnbalancedDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerReconciliationUnbalancedDto.prototype, "txId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerReconciliationUnbalancedDto.prototype, "debit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerReconciliationUnbalancedDto.prototype, "credit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerReconciliationUnbalancedDto.prototype, "delta", void 0);
class LedgerReconciliationResponseDto {
    source;
    status;
    fromIso;
    toIso;
    totalEntries;
    totalTransactions;
    globalDebit;
    globalCredit;
    unbalancedTransactions;
    unattributedEntries;
    generatedAt;
}
exports.LedgerReconciliationResponseDto = LedgerReconciliationResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerReconciliationResponseDto.prototype, "source", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['PASS', 'FAIL'] }),
    __metadata("design:type", String)
], LedgerReconciliationResponseDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerReconciliationResponseDto.prototype, "fromIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerReconciliationResponseDto.prototype, "toIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], LedgerReconciliationResponseDto.prototype, "totalEntries", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], LedgerReconciliationResponseDto.prototype, "totalTransactions", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerReconciliationResponseDto.prototype, "globalDebit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerReconciliationResponseDto.prototype, "globalCredit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [LedgerReconciliationUnbalancedDto] }),
    __metadata("design:type", Array)
], LedgerReconciliationResponseDto.prototype, "unbalancedTransactions", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], LedgerReconciliationResponseDto.prototype, "unattributedEntries", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], LedgerReconciliationResponseDto.prototype, "generatedAt", void 0);
//# sourceMappingURL=ledger-response.dto.js.map