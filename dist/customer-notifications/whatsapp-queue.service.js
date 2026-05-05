"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var WhatsAppQueueService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppQueueService = void 0;
const common_1 = require("@nestjs/common");
const api_1 = require("@opentelemetry/api");
const bullmq_1 = require("bullmq");
const trace_context_1 = require("../common/tracing/trace-context");
const whatsapp_queue_1 = require("./whatsapp.queue");
let WhatsAppQueueService = WhatsAppQueueService_1 = class WhatsAppQueueService {
    logger = new common_1.Logger(WhatsAppQueueService_1.name);
    queue = null;
    onModuleInit() {
        try {
            const connection = (0, whatsapp_queue_1.whatsappRedisConnection)();
            if (!connection) {
                return;
            }
            this.queue = new bullmq_1.Queue(whatsapp_queue_1.WHATSAPP_QUEUE, {
                connection,
                defaultJobOptions: (0, whatsapp_queue_1.whatsappDefaultJobOptions)(),
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
    enqueuePaymentConfirmed(orderId, scenario) {
        try {
            if (!this.queue) {
                return;
            }
            const data = {
                event: 'payment_confirmed',
                payload: {
                    orderId,
                    scenario,
                    timestamp: Date.now(),
                },
                meta: {
                    traceId: (0, trace_context_1.currentTraceId)(),
                },
            };
            this.logger.log(JSON.stringify({
                timestamp: new Date().toISOString(),
                event: 'whatsapp_queue_enqueue',
                traceId: data.meta?.traceId,
                orderId,
                alertEvent: 'payment_confirmed',
            }));
            void this.queue
                .count()
                .then((size) => {
                const span = api_1.trace.getTracer('safari-erp').startSpan('queue.enqueue.whatsapp');
                if (size >= whatsapp_queue_1.WHATSAPP_MAX_QUEUE_SIZE) {
                    this.logger.error(JSON.stringify({
                        timestamp: new Date().toISOString(),
                        event: 'system_overload',
                        traceId: data.meta?.traceId,
                        orderId,
                        queue: 'whatsapp',
                        size,
                        droppedAlert: 'payment_confirmed',
                    }));
                    span.end();
                    return undefined;
                }
                if (size >= whatsapp_queue_1.WHATSAPP_MAX_QUEUE_SIZE * 0.8) {
                    this.logger.warn(`alert_queue_large queue=whatsapp size=${size}`);
                }
                const add = this.queue?.add('payment_confirmed', data, (0, whatsapp_queue_1.whatsappJobOptionsForEnqueue)(orderId));
                span.end();
                return add;
            })
                .catch(() => undefined);
        }
        catch {
        }
    }
};
exports.WhatsAppQueueService = WhatsAppQueueService;
exports.WhatsAppQueueService = WhatsAppQueueService = WhatsAppQueueService_1 = __decorate([
    (0, common_1.Injectable)()
], WhatsAppQueueService);
//# sourceMappingURL=whatsapp-queue.service.js.map