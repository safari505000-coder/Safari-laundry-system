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
exports.CustomerCollectionStatusDto = exports.UpdateCustomerCollectionStatusDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class UpdateCustomerCollectionStatusDto {
    status;
    blocked;
    note;
}
exports.UpdateCustomerCollectionStatusDto = UpdateCustomerCollectionStatusDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.CustomerCollectionStatusKind }),
    (0, class_validator_1.IsEnum)(client_1.CustomerCollectionStatusKind),
    __metadata("design:type", String)
], UpdateCustomerCollectionStatusDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Manual block toggle (no automation writes here).',
    }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateCustomerCollectionStatusDto.prototype, "blocked", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Internal collection note (visible to call-centre only).',
        maxLength: 500,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    (0, class_transformer_1.Transform)(({ value }) => typeof value === 'string' ? value.trim() : value),
    __metadata("design:type", String)
], UpdateCustomerCollectionStatusDto.prototype, "note", void 0);
class CustomerCollectionStatusDto {
    customerId;
    status;
    blocked;
    note;
    updatedAt;
    updatedById;
}
exports.CustomerCollectionStatusDto = CustomerCollectionStatusDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CustomerCollectionStatusDto.prototype, "customerId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.CustomerCollectionStatusKind }),
    __metadata("design:type", String)
], CustomerCollectionStatusDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], CustomerCollectionStatusDto.prototype, "blocked", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", Object)
], CustomerCollectionStatusDto.prototype, "note", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CustomerCollectionStatusDto.prototype, "updatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", Object)
], CustomerCollectionStatusDto.prototype, "updatedById", void 0);
//# sourceMappingURL=update-customer-collection-status.dto.js.map