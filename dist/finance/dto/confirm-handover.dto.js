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
exports.ConfirmHandoverDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class ConfirmHandoverDto {
    driverId;
    depositReceiptUrl;
    declaredHandoverTotal;
}
exports.ConfirmHandoverDto = ConfirmHandoverDto;
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'uuid' }),
    (0, class_validator_1.IsUUID)('4'),
    __metadata("design:type", String)
], ConfirmHandoverDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Optional — slip-first legacy flow. When provided, the custody bag is created directly in AWAITING_VERIFICATION. When omitted, the new Dastur §3 flow creates the bag in PENDING_DEPOSIT and the manager attaches the slip later via POST /api/manager-custody/:id/upload-slip.',
        example: '/uploads/handover-receipts/550e8400-e29b-41d4-a716-446655440000.jpg',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8),
    __metadata("design:type", String)
], ConfirmHandoverDto.prototype, "depositReceiptUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Physical cash counted by manager; if provided, must match ledger within 0.0001 KWD',
        example: 450.25,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsPositive)(),
    __metadata("design:type", Number)
], ConfirmHandoverDto.prototype, "declaredHandoverTotal", void 0);
//# sourceMappingURL=confirm-handover.dto.js.map