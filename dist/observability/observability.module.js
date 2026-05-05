"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObservabilityModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const prisma_module_1 = require("../prisma/prisma.module");
const discord_alerts_module_1 = require("../common/services/discord-alerts.module");
const controller_metrics_interceptor_1 = require("./controller-metrics.interceptor");
const metrics_service_1 = require("./metrics.service");
const queue_integrity_service_1 = require("./queue-integrity.service");
const queue_metrics_collector_1 = require("./queue-metrics.collector");
const silence_breaker_service_1 = require("./silence-breaker.service");
const system_invariants_service_1 = require("./system-invariants.service");
const time_skew_service_1 = require("./time-skew.service");
const revenue_metrics_collector_1 = require("./revenue-metrics.collector");
let ObservabilityModule = class ObservabilityModule {
};
exports.ObservabilityModule = ObservabilityModule;
exports.ObservabilityModule = ObservabilityModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [discord_alerts_module_1.DiscordAlertsModule, prisma_module_1.PrismaModule],
        providers: [
            metrics_service_1.MetricsService,
            queue_metrics_collector_1.QueueMetricsCollector,
            queue_integrity_service_1.QueueIntegrityService,
            silence_breaker_service_1.SilenceBreakerService,
            system_invariants_service_1.SystemInvariantsService,
            time_skew_service_1.TimeSkewService,
            revenue_metrics_collector_1.RevenueMetricsCollector,
            {
                provide: core_1.APP_INTERCEPTOR,
                useClass: controller_metrics_interceptor_1.ControllerMetricsInterceptor,
            },
        ],
        exports: [metrics_service_1.MetricsService],
    })
], ObservabilityModule);
//# sourceMappingURL=observability.module.js.map