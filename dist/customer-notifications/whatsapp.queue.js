"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatsappRedisConnection = exports.WHATSAPP_MAX_QUEUE_SIZE = exports.WHATSAPP_BACKOFF_MS = exports.WHATSAPP_ATTEMPTS = exports.WHATSAPP_DLQ_QUEUE = exports.WHATSAPP_QUEUE = void 0;
exports.whatsappDefaultJobOptions = whatsappDefaultJobOptions;
exports.whatsappJobOptionsForEnqueue = whatsappJobOptionsForEnqueue;
exports.whatsappDlqOptions = whatsappDlqOptions;
const bullmq_job_id_util_1 = require("../common/queue/bullmq-job-id.util");
const discord_alert_queue_1 = require("../common/services/discord-alert.queue");
exports.WHATSAPP_QUEUE = 'whatsapp';
exports.WHATSAPP_DLQ_QUEUE = 'whatsapp:failed';
exports.WHATSAPP_ATTEMPTS = 5;
exports.WHATSAPP_BACKOFF_MS = 1_000;
exports.WHATSAPP_MAX_QUEUE_SIZE = 5_000;
exports.whatsappRedisConnection = discord_alert_queue_1.discordRedisConnection;
function whatsappDefaultJobOptions() {
    return {
        attempts: exports.WHATSAPP_ATTEMPTS,
        backoff: { type: 'exponential', delay: exports.WHATSAPP_BACKOFF_MS },
        removeOnComplete: false,
        removeOnFail: false,
    };
}
function whatsappJobOptionsForEnqueue(orderId) {
    return {
        ...whatsappDefaultJobOptions(),
        jobId: (0, bullmq_job_id_util_1.bullmqStableJobId)('payment_confirmed', orderId),
    };
}
function whatsappDlqOptions(failedJobId, orderId) {
    return {
        ...whatsappDefaultJobOptions(),
        jobId: (0, bullmq_job_id_util_1.bullmqStableJobId)('whatsapp_failed', orderId ?? failedJobId),
    };
}
//# sourceMappingURL=whatsapp.queue.js.map