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
exports.PosCreateCustomerDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const kuwait_customer_phone_1 = require("../../common/validation/kuwait-customer-phone");
function trimOpt(value) {
    if (typeof value !== 'string')
        return value;
    const t = value.trim();
    return t.length ? t : undefined;
}
class PosCreateCustomerDto {
    phone;
    phone2;
    displayName;
    addressArea;
    addressBlock;
    addressStreet;
    addressAvenue;
    addressHouse;
}
exports.PosCreateCustomerDto = PosCreateCustomerDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '51234567' }),
    (0, class_transformer_1.Transform)(({ value }) => typeof value === 'string' ? value.replace(/[\s-]/g, '').trim() : value),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8),
    (0, kuwait_customer_phone_1.IsKuwaitCustomerPhone)(),
    __metadata("design:type", String)
], PosCreateCustomerDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '59990000' }),
    (0, class_transformer_1.Transform)(({ value }) => typeof value === 'string' ? value.replace(/[\s-]/g, '').trim() : value),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8),
    (0, kuwait_customer_phone_1.IsKuwaitCustomerPhone)(),
    __metadata("design:type", String)
], PosCreateCustomerDto.prototype, "phone2", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'محمد أحمد', maxLength: 200 }),
    (0, class_transformer_1.Transform)(({ value }) => typeof value === 'string' ? value.trim() : value),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], PosCreateCustomerDto.prototype, "displayName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'السالمية' }),
    (0, class_transformer_1.Transform)(trimOpt),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], PosCreateCustomerDto.prototype, "addressArea", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '3' }),
    (0, class_transformer_1.Transform)(trimOpt),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], PosCreateCustomerDto.prototype, "addressBlock", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'شارع الخليج' }),
    (0, class_transformer_1.Transform)(trimOpt),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], PosCreateCustomerDto.prototype, "addressStreet", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'جادة 5' }),
    (0, class_transformer_1.Transform)(trimOpt),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], PosCreateCustomerDto.prototype, "addressAvenue", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'منزل 12' }),
    (0, class_transformer_1.Transform)(trimOpt),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], PosCreateCustomerDto.prototype, "addressHouse", void 0);
//# sourceMappingURL=pos-create-customer.dto.js.map