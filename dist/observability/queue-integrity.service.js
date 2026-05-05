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
var QueueIntegrityService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueIntegrityService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const bullmq_1 = require("bullmq");
const discord_alert_queue_1 = require("../common/services/discord-alert.queue");
const whatsapp_queue_1 = require("../customer-notifications/whatsapp.queue");
const STALL_MS = Number.parseInt(process.env.QUEUE_STALL_DETECT_MS ?? '600000', 10) || 600_000;
let QueueIntegrityService = QueueIntegrityService_1 = class QueueIntegrityService {
    logger = new common_1.Logger(QueueIntegrityService_1.name);
    onModuleInit() {
        void this.scanOnce('startup').catch(() => undefined);
    }
    async periodic() {
        await this.scanOnce('interval');
    }
    async scanOnce(source) {
        const connection = (0, discord_alert_queue_1.discordRedisConnection)();
        if (!connection) {
            return;
        }
        const queues = [
            { name: discord_alert_queue_1.DISCORD_ALERT_QUEUE, label: 'discord' },
            { name: whatsapp_queue_1.WHATSAPP_QUEUE, label: 'whatsapp' },
        ];
        const now = Date.now();
        for (const q of queues) {
            const queue = new bullmq_1.Queue(q.name, { connection });
            try {
                const active = await queue.getJobs(['active'], 0, 50);
                for (const job of active) {
                    const age = now - (job.processedOn ?? job.timestamp);
                    if (job.processedOn && age > STALL_MS) {
                        this.logger.error(JSON.stringify({
                            event: 'queue_recovery_stalled_job',
                            traceId: job.data?.meta?.traceId,
                            orderId: job.data?.payload?.orderId,
                            queue: q.label,
                            jobId: job.id,
                            stallAgeMs: age,
                            source,
                        }));
                    }
                }
            }
            finally {
                await queue.close().catch(() => undefined);
            }
        }
        const dlq = [
            { name: discord_alert_queue_1.DISCORD_ALERT_DLQ_QUEUE, label: 'discord_dlq' },
            { name: whatsapp_queue_1.WHATSAPP_DLQ_QUEUE, label: 'whatsapp_dlq' },
        ];
        for (const q of dlq) {
            const queue = new bullmq_1.Queue(q.name, { connection });
            try {
                const [w, f] = await Promise.all([
                    queue.getWaitingCount(),
                    queue.getFailedCount(),
                ]);
                if (w + f > 0) {
                    this.logger.log(JSON.stringify({
                        event: 'queue_recovery_dlq_snapshot',
                        traceId: undefined,
                        orderId: undefined,
                        queue: q.label,
                        waiting: w,
                        failed: f,
                        source,
                    }));
                }
            }
            finally {
                await queue.close().catch(() => undefined);
            }
        }
    }
};
exports.QueueIntegrityService = QueueIntegrityService;
__decorate([
    (0, schedule_1.Interval)(120_000),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], QueueIntegrityService.prototype, "periodic", null);
exports.QueueIntegrityService = QueueIntegrityService = QueueIntegrityService_1 = __decorate([
    (0, common_1.Injectable)()
], QueueIntegrityService);
//# sourceMappingURL=queue-integrity.service.js.map