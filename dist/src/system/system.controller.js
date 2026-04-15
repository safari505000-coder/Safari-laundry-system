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
exports.SystemController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const branding_1 = require("../common/constants/branding");
const operating_hours_service_1 = require("./operating-hours.service");
let SystemController = class SystemController {
    operatingHours;
    constructor(operatingHours) {
        this.operatingHours = operatingHours;
    }
    operatingStatus() {
        return this.operatingHours.getStatusPayload();
    }
};
exports.SystemController = SystemController;
__decorate([
    (0, common_1.Get)('operating-status'),
    (0, swagger_1.ApiOperation)({
        summary: `Operating hours (Kuwait) — ${branding_1.APP_BRAND}`,
        description: 'Public. Used by the web app to show Safari Express “system closed” outside 07:00–23:00 Kuwait time.',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SystemController.prototype, "operatingStatus", null);
exports.SystemController = SystemController = __decorate([
    (0, swagger_1.ApiTags)('system'),
    (0, common_1.Controller)('system'),
    __metadata("design:paramtypes", [operating_hours_service_1.OperatingHoursService])
], SystemController);
//# sourceMappingURL=system.controller.js.map