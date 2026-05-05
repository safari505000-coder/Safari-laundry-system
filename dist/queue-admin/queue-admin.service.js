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
var QueueAdminService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueAdminService = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("bullmq");
const security_state_service_1 = require("../audit-logs/security-state.service");
const discord_alert_queue_1 = require("../common/services/discord-alert.queue");
const integration_circuit_breaker_service_1 = require("../common/services/integration-circuit-breaker.service");
const whatsapp_queue_1 = require("../customer-notifications/whatsapp.queue");
const QUEUES = {
    alerts: {
        main: discord_alert_queue_1.DISCORD_ALERT_QUEUE,
        dlq: discord_alert_queue_1.DISCORD_ALERT_DLQ_QUEUE,
        circuit: 'discord',
    },
    whatsapp: {
        main: whatsapp_queue_1.WHATSAPP_QUEUE,
        dlq: whatsapp_queue_1.WHATSAPP_DLQ_QUEUE,
        circuit: 'whatsapp',
    },
};
let QueueAdminService = QueueAdminService_1 = class QueueAdminService {
    circuitBreaker;
    securityState;
    logger = new common_1.Logger(QueueAdminService_1.name);
    constructor(circuitBreaker, securityState) {
        this.circuitBreaker = circuitBreaker;
        this.securityState = securityState;
    }
    async replay(queueName, limit = 25) {
        await this.assertReplayBudget(queueName, limit);
        const config = QUEUES[queueName];
        const main = this.queue(config.main);
        const dlq = this.queue(config.dlq);
        this.logger.log(`replay_started queue=${queueName} limit=${limit}`);
        let replayed = 0;
        let skipped = 0;
        try {
            const jobs = await dlq.getJobs(['waiting', 'delayed', 'failed'], 0, limit - 1);
            for (const job of jobs) {
                const ok = await this.replayDlqJob(main, job);
                if (!ok) {
                    skipped += 1;
                    continue;
                }
                replayed += 1;
            }
            this.logger.log(`replay_completed queue=${queueName} replayed=${replayed} skipped=${skipped}`);
            return { queue: queueName, replayed, skipped };
        }
        catch (error) {
            this.logger.error(`replay_failed queue=${queueName} reason=${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
        finally {
            await Promise.all([
                main.close().catch(() => undefined),
                dlq.close().catch(() => undefined),
            ]);
        }
    }
    async listDlq(queueName, limit = 50) {
        const names = queueName ? [queueName] : Object.keys(QUEUES);
        const result = {};
        for (const name of names) {
            const dlq = this.queue(QUEUES[name].dlq);
            try {
                const jobs = await dlq.getJobs(['waiting', 'delayed', 'failed'], 0, limit - 1);
                result[name] = jobs.map((job) => {
                    const data = job.data;
                    return {
                        id: job.id,
                        name: job.name,
                        data: job.data,
                        attemptsMade: job.attemptsMade,
                        failedReason: job.failedReason,
                        timestamp: job.timestamp,
                        error: data.error ?? job.failedReason,
                        attempts: data.attempts ?? job.attemptsMade,
                        lastFailureAt: data.lastFailureAt,
                    };
                });
            }
            finally {
                await dlq.close().catch(() => undefined);
            }
        }
        return result;
    }
    async replayJob(queueName, jobId) {
        await this.assertReplayBudget(queueName, 1);
        const config = QUEUES[queueName];
        const main = this.queue(config.main);
        const dlq = this.queue(config.dlq);
        this.logger.log(`replay_started queue=${queueName} jobId=${jobId}`);
        try {
            const job = await dlq.getJob(jobId);
            if (!job) {
                return { queue: queueName, replayed: 0, skipped: 1 };
            }
            const ok = await this.replayDlqJob(main, job);
            this.logger.log(`replay_completed queue=${queueName} replayed=${ok ? 1 : 0}`);
            return { queue: queueName, replayed: ok ? 1 : 0, skipped: ok ? 0 : 1 };
        }
        catch (error) {
            this.logger.error(`replay_failed queue=${queueName} jobId=${jobId} reason=${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
        finally {
            await Promise.all([
                main.close().catch(() => undefined),
                dlq.close().catch(() => undefined),
            ]);
        }
    }
    async metrics() {
        const result = {};
        for (const [name, config] of Object.entries(QUEUES)) {
            const main = this.queue(config.main);
            const dlq = this.queue(config.dlq);
            try {
                const [mainCounts, dlqCounts, circuit] = await Promise.all([
                    main.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed', 'paused'),
                    dlq.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed', 'paused'),
                    this.circuitBreaker.state(config.circuit),
                ]);
                result[name] = {
                    queueSize: (mainCounts.waiting ?? 0) +
                        (mainCounts.active ?? 0) +
                        (mainCounts.delayed ?? 0),
                    jobsProcessed: mainCounts.completed ?? 0,
                    jobsFailed: mainCounts.failed ?? 0,
                    retries: mainCounts.delayed ?? 0,
                    dlqCount: (dlqCounts.waiting ?? 0) +
                        (dlqCounts.active ?? 0) +
                        (dlqCounts.delayed ?? 0) +
                        (dlqCounts.failed ?? 0),
                    circuitState: circuit.state,
                    circuitFailures: circuit.failures,
                    circuitOpenedUntil: circuit.openedUntil ? new Date(circuit.openedUntil).toISOString() : null,
                };
            }
            finally {
                await Promise.all([
                    main.close().catch(() => undefined),
                    dlq.close().catch(() => undefined),
                ]);
            }
        }
        return result;
    }
    queue(name) {
        const connection = (0, discord_alert_queue_1.discordRedisConnection)();
        if (!connection) {
            throw new common_1.ServiceUnavailableException('Redis queue connection is not configured');
        }
        return new bullmq_1.Queue(name, { connection });
    }
    async replayDlqJob(main, job) {
        const data = job.data;
        const replayCount = Number(data.replayCount ?? 0);
        if (replayCount >= 3) {
            return false;
        }
        await main.add(job.name === 'failed' ? 'replay' : job.name, {
            ...data,
            replayedFromDlq: true,
            replayCount: replayCount + 1,
            replayedAt: Date.now(),
        });
        await job.remove();
        return true;
    }
    async assertReplayBudget(queueName, requested) {
        const count = await this.securityState.incrementWindow(`queue-replay:${queueName}`, 60);
        if (count + requested > 100) {
            throw new common_1.ServiceUnavailableException('Replay rate limit exceeded');
        }
    }
};
exports.QueueAdminService = QueueAdminService;
exports.QueueAdminService = QueueAdminService = QueueAdminService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [integration_circuit_breaker_service_1.IntegrationCircuitBreakerService,
        security_state_service_1.SecurityStateService])
], QueueAdminService);
//# sourceMappingURL=queue-admin.service.js.map