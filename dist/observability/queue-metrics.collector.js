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
var QueueMetricsCollector_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueMetricsCollector = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const bullmq_1 = require("bullmq");
const discord_alert_queue_1 = require("../common/services/discord-alert.queue");
const integration_circuit_breaker_service_1 = require("../common/services/integration-circuit-breaker.service");
const whatsapp_queue_1 = require("../customer-notifications/whatsapp.queue");
const metrics_service_1 = require("./metrics.service");
const QUEUES = [
    { name: 'alerts', queue: discord_alert_queue_1.DISCORD_ALERT_QUEUE, dlq: discord_alert_queue_1.DISCORD_ALERT_DLQ_QUEUE, circuit: 'discord' },
    { name: 'whatsapp', queue: whatsapp_queue_1.WHATSAPP_QUEUE, dlq: whatsapp_queue_1.WHATSAPP_DLQ_QUEUE, circuit: 'whatsapp' },
];
let QueueMetricsCollector = QueueMetricsCollector_1 = class QueueMetricsCollector {
    metrics;
    circuitBreaker;
    logger = new common_1.Logger(QueueMetricsCollector_1.name);
    constructor(metrics, circuitBreaker) {
        this.metrics = metrics;
        this.circuitBreaker = circuitBreaker;
    }
    async collect() {
        const connection = (0, discord_alert_queue_1.discordRedisConnection)();
        if (!connection) {
            return;
        }
        const started = performance.now();
        let waitingAlerts = 0;
        let waitingWhatsapp = 0;
        for (const config of QUEUES) {
            const queue = new bullmq_1.Queue(config.queue, { connection });
            const dlq = new bullmq_1.Queue(config.dlq, { connection });
            try {
                const [counts, dlqCounts, circuit] = await Promise.all([
                    queue.getJobCounts('active', 'waiting', 'failed', 'completed', 'delayed'),
                    dlq.getJobCounts('waiting', 'failed', 'delayed'),
                    this.circuitBreaker.state(config.circuit),
                ]);
                if (config.name === 'alerts') {
                    waitingAlerts = counts.waiting ?? 0;
                }
                if (config.name === 'whatsapp') {
                    waitingWhatsapp = counts.waiting ?? 0;
                }
                for (const state of ['active', 'waiting', 'failed', 'completed', 'delayed']) {
                    this.metrics.queueJobs.labels(config.name, state).set(counts[state] ?? 0);
                }
                this.metrics.queueJobsActive.labels(config.name).set(counts.active ?? 0);
                this.metrics.queueJobsWaiting.labels(config.name).set(counts.waiting ?? 0);
                this.metrics.queueJobsFailed.labels(config.name).set(counts.failed ?? 0);
                this.metrics.queueJobsCompleted.labels(config.name).set(counts.completed ?? 0);
                this.metrics.queueJobs
                    .labels(`${config.name}_dlq`, 'waiting')
                    .set((dlqCounts.waiting ?? 0) + (dlqCounts.failed ?? 0) + (dlqCounts.delayed ?? 0));
                this.metrics.circuitState
                    .labels(config.circuit)
                    .set(circuit.state === 'OPEN' ? 1 : circuit.state === 'HALF_OPEN' ? 2 : 0);
            }
            catch (error) {
                this.logger.warn(`queue_metrics_failed queue=${config.name} reason=${error instanceof Error ? error.message : String(error)}`);
            }
            finally {
                await Promise.all([
                    queue.close().catch(() => undefined),
                    dlq.close().catch(() => undefined),
                ]);
            }
        }
        const elapsed = performance.now() - started;
        this.metrics.redisLatency.set(elapsed);
        const backlogHigh = Number.parseInt(process.env.OPS_QUEUE_BACKLOG_WARN ?? '500', 10) || 500;
        if (waitingAlerts + waitingWhatsapp > backlogHigh) {
            this.logger.warn(JSON.stringify({
                event: 'ops_scale_workers_recommended',
                traceId: undefined,
                orderId: undefined,
                waitingAlerts,
                waitingWhatsapp,
                threshold: backlogHigh,
                hint: 'increase_worker_concurrency_or_replicas',
            }));
        }
        const redisSlowMs = Number.parseInt(process.env.OPS_REDIS_LATENCY_WARN_MS ?? '200', 10) || 200;
        if (elapsed > redisSlowMs) {
            this.logger.warn(JSON.stringify({
                event: 'ops_redis_latency_high',
                traceId: undefined,
                orderId: undefined,
                latencyMs: elapsed,
                degrade_hint: 'non_critical_queues_may_backpressure',
            }));
        }
        const factor = Number.parseFloat(process.env.QUEUE_SLO_SECONDS_PER_WAITING_JOB ?? '0.05');
        const f = Number.isFinite(factor) && factor > 0 ? factor : 0.05;
        this.metrics.setQueueDelayEstimateSeconds((waitingAlerts + waitingWhatsapp) * f);
    }
};
exports.QueueMetricsCollector = QueueMetricsCollector;
__decorate([
    (0, schedule_1.Interval)(15_000),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], QueueMetricsCollector.prototype, "collect", null);
exports.QueueMetricsCollector = QueueMetricsCollector = QueueMetricsCollector_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [metrics_service_1.MetricsService,
        integration_circuit_breaker_service_1.IntegrationCircuitBreakerService])
], QueueMetricsCollector);
//# sourceMappingURL=queue-metrics.collector.js.map