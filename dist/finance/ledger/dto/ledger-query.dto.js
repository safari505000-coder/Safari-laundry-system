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
exports.LedgerTransactionsQueryDto = exports.LedgerRangeQueryDto = void 0;
exports.defaultFromIso = defaultFromIso;
exports.defaultToIso = defaultToIso;
exports.assertWithinMaxRange = assertWithinMaxRange;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const MAX_RANGE_DAYS = 90;
const DEFAULT_RANGE_DAYS = 30;
function defaultFromIso() {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - DEFAULT_RANGE_DAYS);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
}
function defaultToIso() {
    const d = new Date();
    d.setUTCHours(23, 59, 59, 999);
    return d.toISOString();
}
function assertWithinMaxRange(fromIso, toIso) {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        throw new Error('Invalid ISO date');
    }
    const days = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
    if (days > MAX_RANGE_DAYS + 0.5) {
        throw new Error(`range exceeds ${MAX_RANGE_DAYS} days`);
    }
}
class LedgerRangeQueryDto {
    from;
    to;
}
exports.LedgerRangeQueryDto = LedgerRangeQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'ISO8601 from (default: 30d ago)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], LedgerRangeQueryDto.prototype, "from", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'ISO8601 to (default: now)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], LedgerRangeQueryDto.prototype, "to", void 0);
class LedgerTransactionsQueryDto extends LedgerRangeQueryDto {
    accountPrefix;
    take;
}
exports.LedgerTransactionsQueryDto = LedgerTransactionsQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter by accountId prefix (e.g. DRIVER_ or BANK_ACCOUNT)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LedgerTransactionsQueryDto.prototype, "accountPrefix", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 200, minimum: 1, maximum: 1000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(1000),
    __metadata("design:type", Number)
], LedgerTransactionsQueryDto.prototype, "take", void 0);
//# sourceMappingURL=ledger-query.dto.js.map