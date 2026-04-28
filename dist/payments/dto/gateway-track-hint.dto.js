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
exports.GatewayTrackHintDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class GatewayTrackHintDto {
    trans_id;
    transId;
    tran_id;
    tranId;
    trackId;
    track_id;
    result;
}
exports.GatewayTrackHintDto = GatewayTrackHintDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Merchant dashboard trans_id (preferred for get-payment-status inquiry id)',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(384),
    __metadata("design:type", String)
], GatewayTrackHintDto.prototype, "trans_id", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'camelCase alias of trans_id' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(384),
    __metadata("design:type", String)
], GatewayTrackHintDto.prototype, "transId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'UPayments tran_id — same inquiry-id slot as trans_id / track_id',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(384),
    __metadata("design:type", String)
], GatewayTrackHintDto.prototype, "tran_id", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'camelCase alias of tran_id' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(384),
    __metadata("design:type", String)
], GatewayTrackHintDto.prototype, "tranId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'UPayments track_id (e.g. …v2 suffix) — same inquiry slot as trans_id',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(384),
    __metadata("design:type", String)
], GatewayTrackHintDto.prototype, "trackId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Alias of trackId (inquiry id for get-payment-status)',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(384),
    __metadata("design:type", String)
], GatewayTrackHintDto.prototype, "track_id", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Echo of return URL result= (CAPTURED, FAILED, …)',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], GatewayTrackHintDto.prototype, "result", void 0);
//# sourceMappingURL=gateway-track-hint.dto.js.map