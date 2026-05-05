"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var OwnerDashboardRefreshScheduler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OwnerDashboardRefreshScheduler = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("bullmq");
const owner_dashboard_queue_1 = require("./owner-dashboard.queue");
let OwnerDashboardRefreshScheduler = OwnerDashboardRefreshScheduler_1 = class OwnerDashboardRefreshScheduler {
    logger = new common_1.Logger(OwnerDashboardRefreshScheduler_1.name);
    queue = null;
    async onModuleInit() {
        const connection = (0, owner_dashboard_queue_1.ownerDashboardRedisConnection)();
        if (!connection) {
            this.logger.warn(JSON.stringify({
                event: 'owner_dashboard_refresh_queue_unconfigured',
                traceId: undefined,
                orderId: undefined,
                queue: owner_dashboard_queue_1.OWNER_DASHBOARD_QUEUE,
            }));
            return;
        }
        this.queue = new bullmq_1.Queue(owner_dashboard_queue_1.OWNER_DASHBOARD_QUEUE, {
            connection,
            defaultJobOptions: {
                removeOnComplete: false,
                removeOnFail: false,
            },
        });
        try {
            await this.removeDuplicateRepeatables();
            await this.queue.add(owner_dashboard_queue_1.REFRESH_OWNER_DASHBOARD_JOB, { scheduledAt: Date.now() }, (0, owner_dashboard_queue_1.ownerDashboardRefreshJobOptions)());
            this.logger.log(JSON.stringify({
                event: 'owner_dashboard_refresh_repeatable_job_ensured',
                traceId: undefined,
                orderId: undefined,
                queue: owner_dashboard_queue_1.OWNER_DASHBOARD_QUEUE,
                jobName: owner_dashboard_queue_1.REFRESH_OWNER_DASHBOARD_JOB,
                jobId: owner_dashboard_queue_1.OWNER_DASHBOARD_JOB_ID,
                everyMs: owner_dashboard_queue_1.OWNER_DASHBOARD_REFRESH_MS,
            }));
        }
        catch (error) {
            this.logger.error(JSON.stringify({
                event: 'owner_dashboard_refresh_repeatable_job_failed',
                traceId: undefined,
                orderId: undefined,
                queue: owner_dashboard_queue_1.OWNER_DASHBOARD_QUEUE,
                jobName: owner_dashboard_queue_1.REFRESH_OWNER_DASHBOARD_JOB,
                jobId: owner_dashboard_queue_1.OWNER_DASHBOARD_JOB_ID,
                reason: error instanceof Error ? error.message : String(error),
            }));
        }
    }
    onModuleDestroy() {
        void this.queue?.close().catch(() => undefined);
        this.queue = null;
    }
    async removeDuplicateRepeatables() {
        const queue = this.queue;
        if (!queue) {
            return;
        }
        const repeatables = await queue.getRepeatableJobs();
        for (const job of repeatables) {
            const everyMs = Number(job.every);
            const duplicate = job.name === owner_dashboard_queue_1.REFRESH_OWNER_DASHBOARD_JOB &&
                (job.id !== owner_dashboard_queue_1.OWNER_DASHBOARD_JOB_ID || everyMs !== owner_dashboard_queue_1.OWNER_DASHBOARD_REFRESH_MS);
            if (!duplicate) {
                continue;
            }
            await queue.removeRepeatableByKey(job.key);
            this.logger.warn(JSON.stringify({
                event: 'owner_dashboard_refresh_duplicate_repeatable_removed',
                traceId: undefined,
                orderId: undefined,
                queue: owner_dashboard_queue_1.OWNER_DASHBOARD_QUEUE,
                jobName: job.name,
                jobId: job.id,
                everyMs,
                key: job.key,
            }));
        }
    }
};
exports.OwnerDashboardRefreshScheduler = OwnerDashboardRefreshScheduler;
exports.OwnerDashboardRefreshScheduler = OwnerDashboardRefreshScheduler = OwnerDashboardRefreshScheduler_1 = __decorate([
    (0, common_1.Injectable)()
], OwnerDashboardRefreshScheduler);
//# sourceMappingURL=owner-dashboard-refresh.scheduler.js.map