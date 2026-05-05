"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestIdMiddleware = requestIdMiddleware;
const node_crypto_1 = require("node:crypto");
const trace_context_1 = require("../tracing/trace-context");
function requestIdMiddleware(req, res, next) {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && incoming.trim().length > 0 ?
        incoming.trim()
        : (0, node_crypto_1.randomUUID)();
    req.requestId = id;
    req.traceId = (0, trace_context_1.currentTraceId)() ?? id;
    res.setHeader('X-Request-ID', id);
    res.setHeader('X-Trace-ID', req.traceId);
    next();
}
//# sourceMappingURL=request-id.middleware.js.map