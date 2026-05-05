"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscordAlertsModule = void 0;
const common_1 = require("@nestjs/common");
const worker_dedup_service_1 = require("./worker-dedup.service");
const discord_alert_service_1 = require("./discord-alert.service");
const discord_alert_worker_1 = require("./discord-alert.worker");
const integration_circuit_breaker_service_1 = require("./integration-circuit-breaker.service");
let DiscordAlertsModule = class DiscordAlertsModule {
};
exports.DiscordAlertsModule = DiscordAlertsModule;
exports.DiscordAlertsModule = DiscordAlertsModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [
            discord_alert_service_1.DiscordAlertService,
            discord_alert_worker_1.DiscordAlertWorker,
            integration_circuit_breaker_service_1.IntegrationCircuitBreakerService,
            worker_dedup_service_1.WorkerDedupService,
        ],
        exports: [discord_alert_service_1.DiscordAlertService, integration_circuit_breaker_service_1.IntegrationCircuitBreakerService, worker_dedup_service_1.WorkerDedupService],
    })
], DiscordAlertsModule);
//# sourceMappingURL=discord-alerts.module.js.map