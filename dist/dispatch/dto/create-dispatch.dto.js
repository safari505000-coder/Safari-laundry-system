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
exports.CreateDispatchDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class CreateDispatchDto {
    customerId;
    driverId;
    instructionNote;
}
exports.CreateDispatchDto = CreateDispatchDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Customer to send the driver to. Must NOT be blocked.',
        example: '11111111-1111-1111-1111-111111111111',
    }),
    (0, class_validator_1.IsUUID)('4'),
    __metadata("design:type", String)
], CreateDispatchDto.prototype, "customerId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Driver assigned to fulfil the dispatch. The driver receives the instruction via SSE / dashboard pull, with no accept/reject affordance.',
        example: '22222222-2222-2222-2222-222222222222',
    }),
    (0, class_validator_1.IsUUID)('4'),
    __metadata("design:type", String)
], CreateDispatchDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Optional free-text note the agent leaves for the driver (e.g. "العميل ينتظر بالباب — اتصل قبل الوصول").',
        example: 'استلام غسيل + توصيل بعد ساعتين',
        maxLength: 500,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CreateDispatchDto.prototype, "instructionNote", void 0);
//# sourceMappingURL=create-dispatch.dto.js.map