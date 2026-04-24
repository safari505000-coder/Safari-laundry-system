"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OperatingHoursModule = void 0;
const common_1 = require("@nestjs/common");
const operating_hours_service_1 = require("./operating-hours.service");
let OperatingHoursModule = class OperatingHoursModule {
};
exports.OperatingHoursModule = OperatingHoursModule;
exports.OperatingHoursModule = OperatingHoursModule = __decorate([
    (0, common_1.Module)({
        providers: [operating_hours_service_1.OperatingHoursService],
        exports: [operating_hours_service_1.OperatingHoursService],
    })
], OperatingHoursModule);
//# sourceMappingURL=operating-hours.module.js.map