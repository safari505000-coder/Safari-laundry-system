"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SerialsModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("../auth/auth.module");
const prisma_module_1 = require("../prisma/prisma.module");
const serial_counter_service_1 = require("./serial-counter.service");
const serial_gap_service_1 = require("./serial-gap.service");
const serials_controller_1 = require("./serials.controller");
const serials_service_1 = require("./serials.service");
let SerialsModule = class SerialsModule {
};
exports.SerialsModule = SerialsModule;
exports.SerialsModule = SerialsModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, auth_module_1.AuthModule],
        controllers: [serials_controller_1.SerialsController],
        providers: [serials_service_1.SerialsService, serial_counter_service_1.SerialCounterService, serial_gap_service_1.SerialGapService],
        exports: [serial_counter_service_1.SerialCounterService],
    })
], SerialsModule);
//# sourceMappingURL=serials.module.js.map