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
exports.CreateVehicleExpenseDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const class_validator_1 = require("class-validator");
class CreateVehicleExpenseDto {
    vehiclePlate;
    vehicleLabel;
    expenseType;
    amount;
    odometerKm;
    vendorName;
    description;
    expenseDate;
    receiptUrl;
}
exports.CreateVehicleExpenseDto = CreateVehicleExpenseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '12345', maxLength: 32 }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(32),
    __metadata("design:type", String)
], CreateVehicleExpenseDto.prototype, "vehiclePlate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'Toyota Hiace 2022 — White',
        maxLength: 120,
        description: 'Optional display label for the vehicle.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CreateVehicleExpenseDto.prototype, "vehicleLabel", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.VehicleExpenseType, example: client_1.VehicleExpenseType.FUEL }),
    (0, class_validator_1.IsEnum)(client_1.VehicleExpenseType),
    __metadata("design:type", String)
], CreateVehicleExpenseDto.prototype, "expenseType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 12.5, minimum: 0.0001 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0.0001),
    __metadata("design:type", Number)
], CreateVehicleExpenseDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 152_340, minimum: 0 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateVehicleExpenseDto.prototype, "odometerKm", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Al-Rihani Auto Repair', maxLength: 160 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(160),
    __metadata("design:type", String)
], CreateVehicleExpenseDto.prototype, "vendorName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Front brake pads replacement', maxLength: 2000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], CreateVehicleExpenseDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-04-19T10:00:00.000Z' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], CreateVehicleExpenseDto.prototype, "expenseDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...',
        description: 'Mandatory receipt photo as a data URL (image/jpeg or image/png).',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(900_000),
    __metadata("design:type", String)
], CreateVehicleExpenseDto.prototype, "receiptUrl", void 0);
//# sourceMappingURL=create-vehicle-expense.dto.js.map