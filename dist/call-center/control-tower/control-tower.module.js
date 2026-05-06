"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ControlTowerModule = void 0;
const common_1 = require("@nestjs/common");
const prisma_module_1 = require("../../prisma/prisma.module");
const control_tower_controller_1 = require("./control-tower.controller");
const control_tower_service_1 = require("./control-tower.service");
const control_tower_stream_service_1 = require("./control-tower-stream.service");
let ControlTowerModule = class ControlTowerModule {
};
exports.ControlTowerModule = ControlTowerModule;
exports.ControlTowerModule = ControlTowerModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule],
        controllers: [control_tower_controller_1.ControlTowerController],
        providers: [control_tower_service_1.ControlTowerService, control_tower_stream_service_1.ControlTowerStreamService],
        exports: [control_tower_service_1.ControlTowerService],
    })
], ControlTowerModule);
//# sourceMappingURL=control-tower.module.js.map