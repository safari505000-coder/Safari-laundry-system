"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SafariStreamModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("../auth/auth.module");
const laundry_price_list_module_1 = require("../laundry-price-list/laundry-price-list.module");
const manager_custody_module_1 = require("../manager-custody/manager-custody.module");
const prisma_module_1 = require("../prisma/prisma.module");
const reports_module_1 = require("../reports/reports.module");
const system_module_1 = require("../system/system.module");
const safari_stream_controller_1 = require("./safari-stream.controller");
const safari_stream_service_1 = require("./safari-stream.service");
let SafariStreamModule = class SafariStreamModule {
};
exports.SafariStreamModule = SafariStreamModule;
exports.SafariStreamModule = SafariStreamModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            system_module_1.SystemModule,
            reports_module_1.ReportsModule,
            laundry_price_list_module_1.LaundryPriceListModule,
            manager_custody_module_1.ManagerCustodyModule,
        ],
        controllers: [safari_stream_controller_1.SafariStreamController],
        providers: [safari_stream_service_1.SafariStreamService],
        exports: [safari_stream_service_1.SafariStreamService],
    })
], SafariStreamModule);
//# sourceMappingURL=safari-stream.module.js.map