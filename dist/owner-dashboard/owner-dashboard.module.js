"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OwnerDashboardModule = void 0;
const common_1 = require("@nestjs/common");
const health_module_1 = require("../health/health.module");
const observability_module_1 = require("../observability/observability.module");
const prisma_module_1 = require("../prisma/prisma.module");
const owner_dashboard_controller_1 = require("./owner-dashboard.controller");
const owner_dashboard_refresh_scheduler_1 = require("./owner-dashboard-refresh.scheduler");
const owner_dashboard_refresh_worker_1 = require("./owner-dashboard-refresh.worker");
const owner_dashboard_service_1 = require("./owner-dashboard.service");
let OwnerDashboardModule = class OwnerDashboardModule {
};
exports.OwnerDashboardModule = OwnerDashboardModule;
exports.OwnerDashboardModule = OwnerDashboardModule = __decorate([
    (0, common_1.Module)({
        imports: [health_module_1.HealthModule, observability_module_1.ObservabilityModule, prisma_module_1.PrismaModule],
        controllers: [owner_dashboard_controller_1.OwnerDashboardController],
        providers: [
            owner_dashboard_service_1.OwnerDashboardService,
            owner_dashboard_refresh_scheduler_1.OwnerDashboardRefreshScheduler,
            owner_dashboard_refresh_worker_1.OwnerDashboardRefreshWorker,
        ],
    })
], OwnerDashboardModule);
//# sourceMappingURL=owner-dashboard.module.js.map