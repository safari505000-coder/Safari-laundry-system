"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DriverOversightModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("../auth/auth.module");
const prisma_module_1 = require("../prisma/prisma.module");
const driver_oversight_controller_1 = require("./driver-oversight.controller");
const driver_oversight_service_1 = require("./driver-oversight.service");
let DriverOversightModule = class DriverOversightModule {
};
exports.DriverOversightModule = DriverOversightModule;
exports.DriverOversightModule = DriverOversightModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, auth_module_1.AuthModule],
        controllers: [driver_oversight_controller_1.DriverOversightController],
        providers: [driver_oversight_service_1.DriverOversightService],
        exports: [driver_oversight_service_1.DriverOversightService],
    })
], DriverOversightModule);
//# sourceMappingURL=driver-oversight.module.js.map