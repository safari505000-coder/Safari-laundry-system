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
exports.CreateLaundryPriceItemDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class CreateLaundryPriceItemDto {
    code;
    nameAr;
    nameEn;
    categoryId;
    sortOrder;
    manualEntry;
    priceNormal;
    priceUrgent;
    pricePressOnly;
    priceUrgentPress;
}
exports.CreateLaundryPriceItemDto = CreateLaundryPriceItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Stable code (e.g. ABA-001). Uppercase.' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(40),
    (0, class_validator_1.Matches)(/^[A-Z0-9][A-Z0-9_-]*$/u, {
        message: 'code must be uppercase ASCII letters, digits, hyphen, or underscore',
    }),
    __metadata("design:type", String)
], CreateLaundryPriceItemDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreateLaundryPriceItemDto.prototype, "nameAr", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((_o, v) => v !== null),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", Object)
], CreateLaundryPriceItemDto.prototype, "nameEn", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((_o, v) => v !== null),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", Object)
], CreateLaundryPriceItemDto.prototype, "categoryId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateLaundryPriceItemDto.prototype, "sortOrder", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'When true the item is priced manually per order (list prices may be 0).',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateLaundryPriceItemDto.prototype, "manualEntry", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'KD price — up to 4 decimal places' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateLaundryPriceItemDto.prototype, "priceNormal", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'KD price — up to 4 decimal places' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateLaundryPriceItemDto.prototype, "priceUrgent", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((_o, v) => v !== null),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Object)
], CreateLaundryPriceItemDto.prototype, "pricePressOnly", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((_o, v) => v !== null),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Object)
], CreateLaundryPriceItemDto.prototype, "priceUrgentPress", void 0);
//# sourceMappingURL=create-laundry-price-item.dto.js.map