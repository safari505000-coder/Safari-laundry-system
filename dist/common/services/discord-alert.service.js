"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DiscordAlertService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscordAlertService = void 0;
const common_1 = require("@nestjs/common");
const api_1 = require("@opentelemetry/api");
const bullmq_1 = require("bullmq");
const bullmq_job_id_util_1 = require("../queue/bullmq-job-id.util");
const trace_context_1 = require("../tracing/trace-context");
const discord_alert_queue_1 = require("./discord-alert.queue");
let DiscordAlertService = DiscordAlertService_1 = class DiscordAlertService {
    logger = new common_1.Logger(DiscordAlertService_1.name);
    queue = null;
    onModuleInit() {
        try {
            const connection = (0, discord_alert_queue_1.discordRedisConnection)();
            if (!connection) {
                return;
            }
            this.queue = new bullmq_1.Queue(discord_alert_queue_1.DISCORD_ALERT_QUEUE, {
                connection,
                defaultJobOptions: {
                    attempts: discord_alert_queue_1.DISCORD_ALERT_ATTEMPTS,
                    backoff: {
                        type: 'exponential',
                        delay: discord_alert_queue_1.DISCORD_ALERT_BACKOFF_MS,
                    },
                    removeOnComplete: false,
                    removeOnFail: false,
                },
            });
        }
        catch {
            this.queue = null;
        }
    }
    onModuleDestroy() {
        try {
            void this.queue?.close().catch(() => undefined);
            this.queue = null;
        }
        catch {
            this.queue = null;
        }
    }
    enqueue(event, payload) {
        try {
            if (!this.queue) {
                return;
            }
            const timestamp = this.toTimestamp(payload.timestamp);
            const isCritical = (0, discord_alert_queue_1.isDiscordCriticalEvent)(event);
            const data = {
                event,
                payload: {
                    ...payload,
                    timestamp,
                },
                meta: {
                    traceId: typeof payload.traceId === 'string' ? payload.traceId : (0, trace_context_1.currentTraceId)(),
                },
            };
            this.logger.log(JSON.stringify({
                timestamp: new Date().toISOString(),
                event: 'alert_queue_enqueue',
                traceId: data.meta?.traceId,
                orderId: typeof payload.orderId === 'string' ? payload.orderId : undefined,
                alertEvent: event,
            }));
            const tracer = api_1.trace.getTracer('safari-erp');
            void this.queue
                .count()
                .then((size) => tracer.startActiveSpan('queue.enqueue.discord', async (span) => {
                try {
                    if (size >= discord_alert_queue_1.DISCORD_ALERT_MAX_QUEUE_SIZE && !isCritical) {
                        this.logger.error(JSON.stringify({
                            timestamp: new Date().toISOString(),
                            event: 'system_overload',
                            traceId: data.meta?.traceId,
                            orderId: typeof payload.orderId === 'string' ? payload.orderId : undefined,
                            queue: 'discord',
                            size,
                            droppedAlert: event,
                        }));
                        return undefined;
                    }
                    if (size >= discord_alert_queue_1.DISCORD_ALERT_MAX_QUEUE_SIZE * 0.8) {
                        this.logger.warn(`alert_queue_large queue=discord size=${size}`);
                    }
                    return await this.queue?.add('alert', data, {
                        jobId: (0, bullmq_job_id_util_1.bullmqStableJobIdFromPayload)(event, {
                            ...payload,
                            traceId: data.meta?.traceId,
                        }),
                        priority: isCritical ? 1 : 5,
                        attempts: discord_alert_queue_1.DISCORD_ALERT_ATTEMPTS,
                        backoff: {
                            type: 'exponential',
                            delay: discord_alert_queue_1.DISCORD_ALERT_BACKOFF_MS,
                        },
                        removeOnComplete: false,
                        removeOnFail: false,
                    });
                }
                finally {
                    span.end();
                }
            }))
                .catch(() => undefined);
        }
        catch {
        }
    }
    toTimestamp(value) {
        return typeof value === 'number' && Number.isFinite(value) ? value : Date.now();
    }
};
exports.DiscordAlertService = DiscordAlertService;
exports.DiscordAlertService = DiscordAlertService = DiscordAlertService_1 = __decorate([
    (0, common_1.Injectable)()
], DiscordAlertService);
//# sourceMappingURL=discord-alert.service.js.map