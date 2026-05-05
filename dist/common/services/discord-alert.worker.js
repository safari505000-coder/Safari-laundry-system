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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var DiscordAlertWorker_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscordAlertWorker = void 0;
const common_1 = require("@nestjs/common");
const api_1 = require("@opentelemetry/api");
const axios_1 = __importDefault(require("axios"));
const bullmq_1 = require("bullmq");
const trace_context_1 = require("../tracing/trace-context");
const discord_alert_queue_1 = require("./discord-alert.queue");
const integration_circuit_breaker_service_1 = require("./integration-circuit-breaker.service");
const worker_dedup_service_1 = require("./worker-dedup.service");
const discord_alert_service_1 = require("./discord-alert.service");
let DiscordAlertWorker = DiscordAlertWorker_1 = class DiscordAlertWorker {
    circuitBreaker;
    dedup;
    discordAlerts;
    logger = new common_1.Logger(DiscordAlertWorker_1.name);
    worker = null;
    dlq = null;
    pending = [];
    flushTimer = null;
    isFlushing = false;
    consecutiveFailures = 0;
    circuitOpenUntil = 0;
    destroyed = false;
    constructor(circuitBreaker, dedup, discordAlerts) {
        this.circuitBreaker = circuitBreaker;
        this.dedup = dedup;
        this.discordAlerts = discordAlerts;
    }
    onModuleInit() {
        try {
            const connection = (0, discord_alert_queue_1.discordRedisConnection)();
            if (!connection) {
                return;
            }
            this.dlq = new bullmq_1.Queue(discord_alert_queue_1.DISCORD_ALERT_DLQ_QUEUE, { connection });
            this.worker = new bullmq_1.Worker(discord_alert_queue_1.DISCORD_ALERT_QUEUE, (job) => this.process(job), {
                connection,
                concurrency: 5,
                limiter: {
                    max: 5,
                    duration: 1_000,
                },
                settings: {
                    backoffStrategy: (_attemptsMade, _type, _err, job) => {
                        const attempts = job?.attemptsMade ?? 0;
                        return (discord_alert_queue_1.DISCORD_ALERT_BACKOFF_MS * 2 ** attempts +
                            Math.floor(Math.random() * 500));
                    },
                },
            });
            this.worker.on('completed', (job) => this.logger.log(`alert_job_success event=${job.data.event}`));
            this.worker.on('failed', (job, error) => {
                if (job && job.attemptsMade >= discord_alert_queue_1.DISCORD_ALERT_ATTEMPTS) {
                    this.discordAlerts.enqueue('ops_retry_exhausted', {
                        queue: 'discord',
                        jobId: String(job.id),
                        sourceEvent: job.data.event,
                        orderId: typeof job.data.payload?.orderId === 'string' ? job.data.payload.orderId : undefined,
                        traceId: job.data.meta?.traceId,
                        error: error?.message ?? 'unknown',
                        timestamp: Date.now(),
                    });
                    this.logger.error('alert_permanent_failure queue=discord');
                    void this.dlq
                        ?.add('failed', {
                        ...job.data,
                        error: error?.message ?? 'unknown',
                        attempts: job.attemptsMade,
                        lastFailureAt: Date.now(),
                    }, {
                        attempts: 1,
                        removeOnComplete: false,
                        removeOnFail: false,
                    })
                        .catch(() => undefined);
                }
            });
            this.worker.on('error', () => undefined);
        }
        catch {
            this.worker = null;
        }
    }
    onModuleDestroy() {
        try {
            this.destroyed = true;
            if (this.flushTimer) {
                clearTimeout(this.flushTimer);
                this.flushTimer = null;
            }
            const shutdownError = new Error('discord_alert_worker_shutdown');
            while (this.pending.length > 0) {
                this.pending.shift()?.reject(shutdownError);
            }
            void this.worker?.close().catch(() => undefined);
            void this.dlq?.close().catch(() => undefined);
            this.worker = null;
            this.dlq = null;
        }
        catch {
            this.worker = null;
        }
    }
    process(job) {
        try {
            if ((0, discord_alert_queue_1.isDiscordCriticalEvent)(job.data.event)) {
                return this.processCritical(job);
            }
            return new Promise((resolve, reject) => {
                this.pending.push({ job, resolve, reject });
                if (this.pending.length >= discord_alert_queue_1.DISCORD_ALERT_BATCH_SIZE) {
                    void this.flushBatch().catch(() => undefined);
                    return;
                }
                this.scheduleFlush();
            });
        }
        catch {
            return Promise.resolve();
        }
    }
    async processCritical(job) {
        return (0, trace_context_1.runWithJobTraceAsync)(job.data.meta?.traceId, 'worker.discord.critical', async () => {
            const jid = String(job.id);
            const orderId = typeof job.data.payload?.orderId === 'string' ? job.data.payload.orderId : undefined;
            if (!(await this.dedup.claimWorkerSideEffect(discord_alert_queue_1.DISCORD_ALERT_QUEUE, jid, {
                traceId: job.data.meta?.traceId,
                orderId,
            }))) {
                return;
            }
            try {
                await this.waitForCircuit();
                await this.sendBatch([job.data]);
                this.consecutiveFailures = 0;
            }
            catch (error) {
                await this.dedup.releaseWorkerSideEffect(discord_alert_queue_1.DISCORD_ALERT_QUEUE, jid);
                this.recordFailure();
                throw this.retryableError(error);
            }
        });
    }
    scheduleFlush() {
        if (this.flushTimer || this.destroyed) {
            return;
        }
        this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            void this.flushBatch().catch(() => undefined);
        }, discord_alert_queue_1.DISCORD_ALERT_BATCH_FLUSH_MS);
        this.flushTimer.unref?.();
    }
    async flushBatch() {
        if (this.isFlushing || this.destroyed || this.pending.length === 0) {
            return;
        }
        this.isFlushing = true;
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        const batch = this.pending.splice(0, discord_alert_queue_1.DISCORD_ALERT_BATCH_SIZE);
        const toSend = [];
        for (const entry of batch) {
            const jid = String(entry.job.id);
            const orderId = typeof entry.job.data.payload?.orderId === 'string' ?
                entry.job.data.payload.orderId
                : undefined;
            if (await this.dedup.claimWorkerSideEffect(discord_alert_queue_1.DISCORD_ALERT_QUEUE, jid, {
                traceId: entry.job.data.meta?.traceId,
                orderId,
            })) {
                toSend.push(entry);
            }
            else {
                entry.resolve();
            }
        }
        if (toSend.length === 0) {
            this.isFlushing = false;
            if (this.pending.length > 0) {
                this.scheduleFlush();
            }
            return;
        }
        const span = api_1.trace.getTracer('safari-erp').startSpan('worker.discord.batch');
        try {
            await this.waitForCircuit();
            await this.sendBatch(toSend.map((entry) => entry.job.data));
            this.consecutiveFailures = 0;
            for (const entry of toSend) {
                entry.resolve();
            }
        }
        catch (error) {
            for (const entry of toSend) {
                await this.dedup.releaseWorkerSideEffect(discord_alert_queue_1.DISCORD_ALERT_QUEUE, String(entry.job.id));
            }
            this.recordFailure();
            const retryable = this.retryableError(error);
            for (const entry of toSend) {
                entry.reject(retryable);
            }
        }
        finally {
            span.end();
            this.isFlushing = false;
            if (this.pending.length > 0) {
                this.scheduleFlush();
            }
        }
    }
    async sendBatch(batch) {
        const webhookUrl = this.webhookUrl();
        if (!webhookUrl || batch.length === 0) {
            return;
        }
        const circuitState = await this.circuitBreaker.beforeRequest('discord');
        if (circuitState === 'OPEN') {
            throw this.retryableError('discord_circuit_open');
        }
        let response;
        try {
            response = await axios_1.default.post(webhookUrl, (0, discord_alert_queue_1.buildDiscordMessage)(batch), {
                timeout: discord_alert_queue_1.DISCORD_ALERT_TIMEOUT_MS,
                headers: {
                    'Content-Type': 'application/json',
                    ...(batch[0]?.meta?.traceId ?
                        { 'x-trace-id': String(batch[0].meta.traceId) }
                        : {}),
                },
                validateStatus: () => true,
            });
        }
        catch (error) {
            await this.circuitBreaker.recordFailure('discord');
            throw this.retryableError(error);
        }
        if (response.status >= 200 && response.status < 300) {
            await this.circuitBreaker.recordSuccess('discord');
            return;
        }
        if (response.status >= 500) {
            await this.circuitBreaker.recordFailure('discord');
            throw this.retryableError(`discord_5xx status=${response.status}`);
        }
    }
    recordFailure() {
        this.consecutiveFailures += 1;
        if (this.consecutiveFailures >= 5) {
            this.circuitOpenUntil = Date.now() + 30_000;
            this.consecutiveFailures = 0;
            this.logger.warn('circuit_opened integration=discord');
        }
    }
    async waitForCircuit() {
        const waitMs = this.circuitOpenUntil - Date.now();
        if (waitMs > 0) {
            await this.delay(waitMs);
        }
        const st = await this.circuitBreaker.state('discord');
        if (st.state === 'OPEN' && st.openedUntil > Date.now()) {
            const extra = Math.min(30_000, st.openedUntil - Date.now() + 2_000);
            if (extra > 0) {
                await this.delay(extra);
            }
        }
    }
    retryableError(error) {
        if (error instanceof Error) {
            return error;
        }
        return new Error(String(error || 'discord_alert_retryable_failure'));
    }
    webhookUrl() {
        try {
            return process.env.DISCORD_WEBHOOK_URL?.trim() ?? '';
        }
        catch {
            return '';
        }
    }
    delay(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, Math.max(0, ms));
        });
    }
};
exports.DiscordAlertWorker = DiscordAlertWorker;
exports.DiscordAlertWorker = DiscordAlertWorker = DiscordAlertWorker_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [integration_circuit_breaker_service_1.IntegrationCircuitBreakerService,
        worker_dedup_service_1.WorkerDedupService,
        discord_alert_service_1.DiscordAlertService])
], DiscordAlertWorker);
//# sourceMappingURL=discord-alert.worker.js.map