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
var MetricsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prom_client_1 = require("prom-client");
let MetricsService = class MetricsService {
    static { MetricsService_1 = this; }
    registry = new prom_client_1.Registry();
    finalizeDuration = new prom_client_1.Histogram({
        name: 'payments_finalize_duration_ms',
        help: 'Payment finalization duration in milliseconds',
        buckets: [10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000],
        registers: [this.registry],
    });
    finalizeSuccess = new prom_client_1.Counter({
        name: 'payments_finalize_success_total',
        help: 'Successful payment finalizations',
        registers: [this.registry],
    });
    finalizeFailure = new prom_client_1.Counter({
        name: 'payments_finalize_failure_total',
        help: 'Failed payment finalizations',
        registers: [this.registry],
    });
    controllerDuration = new prom_client_1.Histogram({
        name: 'http_controller_duration_ms',
        help: 'Nest controller request duration in milliseconds',
        labelNames: ['method', 'route', 'status'],
        buckets: [5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000],
        registers: [this.registry],
    });
    queueJobs = new prom_client_1.Gauge({
        name: 'queue_jobs',
        help: 'BullMQ job counts by queue and state',
        labelNames: ['queue', 'state'],
        registers: [this.registry],
    });
    queueJobsActive = new prom_client_1.Gauge({
        name: 'queue_jobs_active',
        help: 'BullMQ active jobs by logical queue name',
        labelNames: ['queue'],
        registers: [this.registry],
    });
    queueJobsWaiting = new prom_client_1.Gauge({
        name: 'queue_jobs_waiting',
        help: 'BullMQ waiting jobs by logical queue name',
        labelNames: ['queue'],
        registers: [this.registry],
    });
    queueJobsFailed = new prom_client_1.Gauge({
        name: 'queue_jobs_failed',
        help: 'BullMQ failed jobs by logical queue name',
        labelNames: ['queue'],
        registers: [this.registry],
    });
    queueJobsCompleted = new prom_client_1.Gauge({
        name: 'queue_jobs_completed',
        help: 'BullMQ completed jobs by logical queue name',
        labelNames: ['queue'],
        registers: [this.registry],
    });
    circuitState = new prom_client_1.Gauge({
        name: 'circuit_state',
        help: 'Circuit breaker state: 0=closed, 1=open, 2=half_open',
        labelNames: ['service'],
        registers: [this.registry],
    });
    redisLatency = new prom_client_1.Gauge({
        name: 'redis_latency_ms',
        help: 'Observed Redis latency in milliseconds',
        registers: [this.registry],
    });
    dbQueryDuration = new prom_client_1.Histogram({
        name: 'db_query_duration_ms',
        help: 'Observed database query duration in milliseconds',
        buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1_000],
        registers: [this.registry],
    });
    sloPaymentSuccessRatio = new prom_client_1.Gauge({
        name: 'slo_payment_success_ratio',
        help: 'Rolling payment finalize success ratio (target 0.999)',
        registers: [this.registry],
    });
    sloLatencyP95 = new prom_client_1.Gauge({
        name: 'slo_latency_p95',
        help: 'Rolling P95 payment finalize latency in ms (SLO < 200ms)',
        registers: [this.registry],
    });
    sloErrorBudgetRemaining = new prom_client_1.Gauge({
        name: 'slo_payment_error_budget_remaining_ratio',
        help: 'Remaining error budget vs target over rolling 5m window (0-1)',
        registers: [this.registry],
    });
    paymentsPerMinute = new prom_client_1.Gauge({
        name: 'payments_per_minute',
        help: 'Finalize attempts observed in the last 60s on this instance',
        registers: [this.registry],
    });
    paymentFailureRate = new prom_client_1.Gauge({
        name: 'payment_failure_rate',
        help: 'Rolling finalize failure ratio on this instance (0-1)',
        registers: [this.registry],
    });
    revenueTotal = new prom_client_1.Gauge({
        name: 'revenue_total',
        help: 'Settled order revenue snapshot (KWD) from DB aggregate (async collector)',
        registers: [this.registry],
    });
    queueDelayEstimate = new prom_client_1.Gauge({
        name: 'slo_queue_delay_estimate_s',
        help: 'Heuristic queue lag estimate from backlog (see runbooks)',
        registers: [this.registry],
    });
    finalizeSamples = [];
    static SAMPLE_MAX_AGE_MS = 5 * 60_000;
    static SAMPLE_CAP = 10_000;
    constructor() {
        (0, prom_client_1.collectDefaultMetrics)({ register: this.registry });
    }
    recordFinalize(durationMs, ok) {
        this.finalizeDuration.observe(durationMs);
        if (ok) {
            this.finalizeSuccess.inc();
        }
        else {
            this.finalizeFailure.inc();
        }
        const now = Date.now();
        this.finalizeSamples.push({ t: now, ms: durationMs, ok });
        if (this.finalizeSamples.length > MetricsService_1.SAMPLE_CAP) {
            this.finalizeSamples.splice(0, this.finalizeSamples.length - MetricsService_1.SAMPLE_CAP);
        }
        this.trimSamples(now);
    }
    setRevenueTotalKd(value) {
        if (Number.isFinite(value) && value >= 0) {
            this.revenueTotal.set(value);
        }
    }
    setQueueDelayEstimateSeconds(value) {
        if (Number.isFinite(value) && value >= 0) {
            this.queueDelayEstimate.set(value);
        }
    }
    paymentSnapshot() {
        const now = Date.now();
        this.trimSamples(now);
        const win = this.finalizeSamples.filter((s) => now - s.t < MetricsService_1.SAMPLE_MAX_AGE_MS);
        const successCount = win.filter((s) => s.ok).length;
        const failureCount = win.length - successCount;
        const successRate = win.length > 0 ? Math.round((successCount / win.length) * 10_000) / 100 : 100;
        return { successRate, successCount, failureCount };
    }
    refreshDerivedSloGauges() {
        const now = Date.now();
        this.trimSamples(now);
        const win = this.finalizeSamples.filter((s) => now - s.t < MetricsService_1.SAMPLE_MAX_AGE_MS);
        const n = win.length;
        if (n === 0) {
            this.sloPaymentSuccessRatio.set(1);
            this.sloLatencyP95.set(0);
            this.paymentFailureRate.set(0);
            this.sloErrorBudgetRemaining.set(1);
            this.paymentsPerMinute.set(0);
            return;
        }
        const okc = win.filter((s) => s.ok).length;
        const fc = n - okc;
        const ratio = okc / n;
        this.sloPaymentSuccessRatio.set(ratio);
        this.paymentFailureRate.set(fc / n);
        const sortedMs = win.map((s) => s.ms).sort((a, b) => a - b);
        const idx = Math.max(0, Math.ceil(sortedMs.length * 0.95) - 1);
        this.sloLatencyP95.set(sortedMs[idx] ?? 0);
        const target = Number.parseFloat(process.env.PAYMENT_SLO_TARGET ?? '0.999');
        const safeTarget = Number.isFinite(target) && target > 0 && target < 1 ? target : 0.999;
        const allowed = (1 - safeTarget) * n;
        const budgetRem = allowed > 0 ? Math.max(0, allowed - fc) / allowed : 1;
        this.sloErrorBudgetRemaining.set(Math.min(1, budgetRem));
        const oneMin = win.filter((s) => now - s.t < 60_000).length;
        this.paymentsPerMinute.set(oneMin);
    }
    trimSamples(now) {
        const cutoff = now - MetricsService_1.SAMPLE_MAX_AGE_MS;
        while (this.finalizeSamples.length > 0 && this.finalizeSamples[0].t < cutoff) {
            this.finalizeSamples.shift();
        }
    }
    async prometheus() {
        return this.registry.metrics();
    }
};
exports.MetricsService = MetricsService;
__decorate([
    (0, schedule_1.Interval)(10_000),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MetricsService.prototype, "refreshDerivedSloGauges", null);
exports.MetricsService = MetricsService = MetricsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], MetricsService);
//# sourceMappingURL=metrics.service.js.map