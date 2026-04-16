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
exports.UpdateDriverTrackingDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class UpdateDriverTrackingDto {
    vehicleLabel;
    lastKnownLocation;
}
exports.UpdateDriverTrackingDto = UpdateDriverTrackingDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Toyota LC300' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], UpdateDriverTrackingDto.prototype, "vehicleLabel", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: '29.3759,47.9774',
        description: 'Latitude/longitude as "lat,lng"',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], UpdateDriverTrackingDto.prototype, "lastKnownLocation", void 0);
//# sourceMappingURL=update-driver-tracking.dto.js.map