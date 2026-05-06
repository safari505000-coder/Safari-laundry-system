"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutstandingModule = void 0;
const common_1 = require("@nestjs/common");
const orders_module_1 = require("../../orders/orders.module");
const prisma_module_1 = require("../../prisma/prisma.module");
const outstanding_controller_1 = require("./outstanding.controller");
const outstanding_export_service_1 = require("./outstanding-export.service");
const outstanding_service_1 = require("./outstanding.service");
const outstanding_snapshot_cron_1 = require("./outstanding-snapshot.cron");
let OutstandingModule = class OutstandingModule {
};
exports.OutstandingModule = OutstandingModule;
exports.OutstandingModule = OutstandingModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, (0, common_1.forwardRef)(() => orders_module_1.OrdersModule)],
        controllers: [outstanding_controller_1.OutstandingController],
        providers: [
            outstanding_service_1.OutstandingService,
            outstanding_export_service_1.OutstandingExportService,
            outstanding_snapshot_cron_1.OutstandingSnapshotCron,
        ],
        exports: [outstanding_service_1.OutstandingService],
    })
], OutstandingModule);
//# sourceMappingURL=outstanding.module.js.map