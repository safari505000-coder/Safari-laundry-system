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
var SilenceBreakerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SilenceBreakerService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const bullmq_1 = require("bullmq");
const discord_alert_queue_1 = require("../common/services/discord-alert.queue");
const integration_circuit_breaker_service_1 = require("../common/services/integration-circuit-breaker.service");
const discord_alert_service_1 = require("../common/services/discord-alert.service");
const whatsapp_queue_1 = require("../customer-notifications/whatsapp.queue");
const DLQ_THRESHOLD = Number.parseInt(process.env.OPS_DLQ_ALERT_THRESHOLD ?? '30', 10) || 30;
const CIRCUIT_OPEN_ALERT_MS = Number.parseInt(process.env.OPS_CIRCUIT_OPEN_ALERT_MS ?? '120000', 10) || 120_000;
let SilenceBreakerService = SilenceBreakerService_1 = class SilenceBreakerService {
    circuit;
    discord;
    logger = new common_1.Logger(SilenceBreakerService_1.name);
    lastDlqAlert = 0;
    lastCircuitAlert = new Map();
    constructor(circuit, discord) {
        this.circuit = circuit;
        this.discord = discord;
    }
    async tick() {
        await this.checkDlqDepth();
        await this.checkCircuitDuration();
    }
    async checkDlqDepth() {
        const conn = (0, discord_alert_queue_1.discordRedisConnection)();
        if (!conn) {
            return;
        }
        let total = 0;
        for (const name of [discord_alert_queue_1.DISCORD_ALERT_DLQ_QUEUE, whatsapp_queue_1.WHATSAPP_DLQ_QUEUE]) {
            const q = new bullmq_1.Queue(name, { connection: conn });
            try {
                const [w, f] = await Promise.all([q.getWaitingCount(), q.getFailedCount()]);
                total += w + f;
            }
            finally {
                await q.close().catch(() => undefined);
            }
        }
        if (total < DLQ_THRESHOLD) {
            return;
        }
        const now = Date.now();
        if (now - this.lastDlqAlert < 300_000) {
            return;
        }
        this.lastDlqAlert = now;
        this.logger.error(JSON.stringify({
            event: 'ops_dlq_depth_alert',
            traceId: undefined,
            orderId: undefined,
            total,
            threshold: DLQ_THRESHOLD,
        }));
        this.discord.enqueue('ops_dlq_depth_alert', {
            total,
            threshold: DLQ_THRESHOLD,
            timestamp: now,
        });
    }
    async checkCircuitDuration() {
        const now = Date.now();
        for (const name of ['discord', 'whatsapp']) {
            const r = await this.circuit.state(name);
            if (r.state !== 'OPEN') {
                continue;
            }
            if (!r.openedAt || now - r.openedAt < CIRCUIT_OPEN_ALERT_MS) {
                continue;
            }
            const last = this.lastCircuitAlert.get(name) ?? 0;
            if (now - last < 300_000) {
                continue;
            }
            this.lastCircuitAlert.set(name, now);
            this.logger.error(JSON.stringify({
                event: 'ops_circuit_open_prolonged',
                traceId: undefined,
                orderId: undefined,
                integration: name,
                openedMs: now - r.openedAt,
            }));
            this.discord.enqueue('ops_circuit_open_prolonged', {
                integration: name,
                openedMs: now - r.openedAt,
                timestamp: now,
            });
        }
    }
};
exports.SilenceBreakerService = SilenceBreakerService;
__decorate([
    (0, schedule_1.Interval)(60_000),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SilenceBreakerService.prototype, "tick", null);
exports.SilenceBreakerService = SilenceBreakerService = SilenceBreakerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [integration_circuit_breaker_service_1.IntegrationCircuitBreakerService,
        discord_alert_service_1.DiscordAlertService])
], SilenceBreakerService);
//# sourceMappingURL=silence-breaker.service.js.map