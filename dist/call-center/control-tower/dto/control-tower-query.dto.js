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
exports.ControlTowerQueryDto = exports.ControlTowerPreset = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
var ControlTowerPreset;
(function (ControlTowerPreset) {
    ControlTowerPreset["ALL"] = "all";
    ControlTowerPreset["TODAY"] = "today";
    ControlTowerPreset["WEEK"] = "week";
    ControlTowerPreset["MONTH"] = "month";
})(ControlTowerPreset || (exports.ControlTowerPreset = ControlTowerPreset = {}));
class ControlTowerQueryDto {
    preset;
    driverId;
    topLimit;
}
exports.ControlTowerQueryDto = ControlTowerQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        enum: ControlTowerPreset,
        default: ControlTowerPreset.ALL,
        description: 'Restrict unpaid invoices by `Order.createdAt` (Kuwait-aligned bounds for today/month).',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(ControlTowerPreset),
    __metadata("design:type", String)
], ControlTowerQueryDto.prototype, "preset", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Optional driver UUID — limits rows to customers with this driver on an unpaid row or on an active dispatch.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], ControlTowerQueryDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Maximum rows in `rows` (1–200). Default 50.',
        minimum: 1,
        maximum: 200,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => {
        if (typeof value === 'number')
            return value;
        if (typeof value === 'string' && value.trim()) {
            const n = Number.parseInt(value, 10);
            return Number.isFinite(n) ? n : undefined;
        }
        return undefined;
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(200),
    __metadata("design:type", Number)
], ControlTowerQueryDto.prototype, "topLimit", void 0);
//# sourceMappingURL=control-tower-query.dto.js.map