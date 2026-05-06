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
exports.OutstandingQueryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
class OutstandingQueryDto {
    from;
    to;
    branchId;
    driverId;
    customerId;
    status;
    search;
    blocked;
}
exports.OutstandingQueryDto = OutstandingQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Inclusive ISO-8601 lower bound on Order.createdAt.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], OutstandingQueryDto.prototype, "from", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Inclusive ISO-8601 upper bound on Order.createdAt.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], OutstandingQueryDto.prototype, "to", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Branch scope (optional). Same semantics as Collections / operations-summary `branchId`.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], OutstandingQueryDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter by the assigned driver.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], OutstandingQueryDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Restrict to a single customer.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], OutstandingQueryDto.prototype, "customerId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        enum: client_1.CustomerCollectionStatusKind,
        description: 'Filter by the AR collection-status flag.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.CustomerCollectionStatusKind),
    __metadata("design:type", String)
], OutstandingQueryDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Free-text search over customer name / phone.',
        maxLength: 80,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    (0, class_transformer_1.Transform)(({ value }) => typeof value === 'string' ? value.trim() : value),
    __metadata("design:type", String)
], OutstandingQueryDto.prototype, "search", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'When true, return blocked customers only.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => {
        if (typeof value === 'boolean')
            return value;
        if (typeof value === 'string') {
            const v = value.trim().toLowerCase();
            if (v === 'true' || v === '1')
                return true;
            if (v === 'false' || v === '0')
                return false;
        }
        return undefined;
    }),
    __metadata("design:type", Boolean)
], OutstandingQueryDto.prototype, "blocked", void 0);
//# sourceMappingURL=outstanding-query.dto.js.map