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
exports.CreateDebtTransferDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class CreateDebtTransferDto {
    sourceDriverId;
    targetDriverId;
    orderIds;
    reason;
    notes;
}
exports.CreateDebtTransferDto = CreateDebtTransferDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        format: 'uuid',
        description: 'Departing driver (owner of the outstanding PAID_TO_DRIVER orders).',
    }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreateDebtTransferDto.prototype, "sourceDriverId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        format: 'uuid',
        description: 'Replacement driver accepting the debt.',
    }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreateDebtTransferDto.prototype, "targetDriverId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: [String],
        description: 'Orders (UUIDs) whose cash responsibility is transferred.',
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.IsUUID)(undefined, { each: true }),
    __metadata("design:type", Array)
], CreateDebtTransferDto.prototype, "orderIds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Short reason (e.g. "driver travelling").' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CreateDebtTransferDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Free-form notes printed on the receipt.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], CreateDebtTransferDto.prototype, "notes", void 0);
//# sourceMappingURL=create-debt-transfer.dto.js.map