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
var OwnerDashboardRefreshWorker_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OwnerDashboardRefreshWorker = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("bullmq");
const discord_alert_service_1 = require("../common/services/discord-alert.service");
const owner_dashboard_queue_1 = require("./owner-dashboard.queue");
const owner_dashboard_service_1 = require("./owner-dashboard.service");
let OwnerDashboardRefreshWorker = OwnerDashboardRefreshWorker_1 = class OwnerDashboardRefreshWorker {
    dashboard;
    alerts;
    logger = new common_1.Logger(OwnerDashboardRefreshWorker_1.name);
    worker = null;
    constructor(dashboard, alerts) {
        this.dashboard = dashboard;
        this.alerts = alerts;
    }
    onModuleInit() {
        const connection = (0, owner_dashboard_queue_1.ownerDashboardRedisConnection)();
        if (!connection) {
            this.logger.warn(JSON.stringify({
                event: 'owner_dashboard_refresh_worker_unconfigured',
                traceId: undefined,
                orderId: undefined,
                queue: owner_dashboard_queue_1.OWNER_DASHBOARD_QUEUE,
            }));
            return;
        }
        this.worker = new bullmq_1.Worker(owner_dashboard_queue_1.OWNER_DASHBOARD_QUEUE, (job) => this.process(job), {
            connection,
            concurrency: 1,
            limiter: {
                max: 1,
                duration: 9_000,
            },
            settings: {
                backoffStrategy: (_attemptsMade, _type, _err, job) => {
                    const attempts = job?.attemptsMade ?? 0;
                    return 1_000 * 2 ** attempts + Math.floor(Math.random() * 300);
                },
            },
        });
        this.worker.on('completed', (job) => {
            this.logger.log(JSON.stringify({
                event: 'owner_dashboard_refresh_job_completed',
                traceId: undefined,
                orderId: undefined,
                jobId: job.id,
                jobName: job.name,
                attemptsMade: job.attemptsMade,
            }));
        });
        this.worker.on('failed', (job, error) => {
            this.logger.error(JSON.stringify({
                event: 'owner_dashboard_refresh_job_failed',
                traceId: undefined,
                orderId: undefined,
                jobId: job?.id,
                jobName: job?.name,
                attemptsMade: job?.attemptsMade,
                attemptsConfigured: job?.opts.attempts,
                reason: error?.message ?? 'unknown',
            }));
            if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
                this.alertRepeatedFailure(job, error);
            }
        });
        this.worker.on('error', (error) => {
            this.logger.error(JSON.stringify({
                event: 'owner_dashboard_refresh_worker_error',
                traceId: undefined,
                orderId: undefined,
                queue: owner_dashboard_queue_1.OWNER_DASHBOARD_QUEUE,
                reason: error instanceof Error ? error.message : String(error),
            }));
        });
    }
    onModuleDestroy() {
        void this.worker?.close().catch(() => undefined);
        this.worker = null;
    }
    async process(job) {
        if (job.name !== owner_dashboard_queue_1.REFRESH_OWNER_DASHBOARD_JOB) {
            this.logger.warn(JSON.stringify({
                event: 'owner_dashboard_refresh_unknown_job',
                traceId: undefined,
                orderId: undefined,
                jobId: job.id,
                jobName: job.name,
            }));
            return;
        }
        const started = performance.now();
        this.logger.log(JSON.stringify({
            event: 'owner_dashboard_refresh_job_started',
            traceId: undefined,
            orderId: undefined,
            jobId: job.id,
            jobName: job.name,
            attemptsMade: job.attemptsMade,
        }));
        await this.dashboard.refreshDashboard();
        this.logger.log(JSON.stringify({
            event: 'owner_dashboard_refresh_cache_updated',
            traceId: undefined,
            orderId: undefined,
            jobId: job.id,
            jobName: job.name,
            durationMs: Math.round(performance.now() - started),
        }));
    }
    alertRepeatedFailure(job, error) {
        this.alerts.enqueue('owner_dashboard_refresh_failed', {
            jobId: String(job.id),
            jobName: job.name,
            attemptsMade: job.attemptsMade,
            attemptsConfigured: job.opts.attempts ?? 1,
            error: error.message,
            timestamp: Date.now(),
        });
    }
};
exports.OwnerDashboardRefreshWorker = OwnerDashboardRefreshWorker;
exports.OwnerDashboardRefreshWorker = OwnerDashboardRefreshWorker = OwnerDashboardRefreshWorker_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [owner_dashboard_service_1.OwnerDashboardService,
        discord_alert_service_1.DiscordAlertService])
], OwnerDashboardRefreshWorker);
//# sourceMappingURL=owner-dashboard-refresh.worker.js.map