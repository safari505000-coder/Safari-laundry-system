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
exports.ReassignDispatchDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class ReassignDispatchDto {
    newDriverId;
    reason;
}
exports.ReassignDispatchDto = ReassignDispatchDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'New driver assignee. Must be active, role DRIVER, and not equal to the current driver.',
        example: '22222222-2222-2222-2222-222222222222',
    }),
    (0, class_validator_1.IsUUID)('4'),
    __metadata("design:type", String)
], ReassignDispatchDto.prototype, "newDriverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Optional reason. Stored on the successor dispatch as `instructionNote` and embedded in the DISPATCH_REASSIGNED audit row.',
        example: 'السائق الأول لم يصل خلال 25 دقيقة',
        maxLength: 500,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], ReassignDispatchDto.prototype, "reason", void 0);
//# sourceMappingURL=reassign-dispatch.dto.js.map