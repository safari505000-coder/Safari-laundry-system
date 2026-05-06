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
exports.DispatchDriverDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class DispatchDriverDto {
    id;
    name;
    isActive;
    activeLoad;
}
exports.DispatchDriverDto = DispatchDriverDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '22222222-2222-2222-2222-222222222222',
        description: 'Driver user UUID — feeds POST /call-center/dispatch.driverId.',
    }),
    __metadata("design:type", String)
], DispatchDriverDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'فهد العنزي',
        description: 'Display name (User.fullName, falling back to username when empty).',
    }),
    __metadata("design:type", String)
], DispatchDriverDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: 'Always true in the current contract — inactive drivers are filtered out at the service layer. Kept on the DTO so a future "show inactive too" query parameter does not require a breaking schema change.',
    }),
    __metadata("design:type", Boolean)
], DispatchDriverDto.prototype, "isActive", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 2,
        description: 'Current count of ASSIGNED dispatches held by this driver. The roster is sorted by this value ascending so the least-loaded driver appears first — clients can also surface this number to help the operator pick.',
    }),
    __metadata("design:type", Number)
], DispatchDriverDto.prototype, "activeLoad", void 0);
//# sourceMappingURL=dispatch-driver.dto.js.map