"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bullmqStableJobId = bullmqStableJobId;
exports.bullmqStableJobIdFromPayload = bullmqStableJobIdFromPayload;
const node_crypto_1 = require("node:crypto");
function bullmqStableJobId(event, orderId) {
    const h = (0, node_crypto_1.createHash)('sha256');
    h.update(String(event));
    h.update('\x1e');
    h.update(orderId ? String(orderId).trim() : '');
    return `h${h.digest('hex').slice(0, 40)}`;
}
function bullmqStableJobIdFromPayload(event, payload) {
    const oid = payload.orderId;
    if (typeof oid === 'string' && oid.length >= 8) {
        return bullmqStableJobId(event, oid);
    }
    const h = (0, node_crypto_1.createHash)('sha256');
    h.update(event);
    h.update(JSON.stringify(payload, Object.keys(payload).sort()));
    return `h${h.digest('hex').slice(0, 40)}`;
}
//# sourceMappingURL=bullmq-job-id.util.js.map