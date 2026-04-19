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
exports.StocktakeDto = exports.StocktakeLineDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class StocktakeLineDto {
    stockItemId;
    countedQuantity;
    note;
}
exports.StocktakeLineDto = StocktakeLineDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], StocktakeLineDto.prototype, "stockItemId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Counted physical quantity on hand (absolute, never negative).' }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], StocktakeLineDto.prototype, "countedQuantity", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Optional per-line remark (e.g. "bottle leaked").' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], StocktakeLineDto.prototype, "note", void 0);
class StocktakeDto {
    branchId;
    reference;
    note;
    lines;
}
exports.StocktakeDto = StocktakeDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], StocktakeDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Human label / sheet number for this count (e.g. "Q1-2026 physical").',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], StocktakeDto.prototype, "reference", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], StocktakeDto.prototype, "note", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [StocktakeLineDto] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => StocktakeLineDto),
    __metadata("design:type", Array)
], StocktakeDto.prototype, "lines", void 0);
//# sourceMappingURL=stocktake.dto.js.map