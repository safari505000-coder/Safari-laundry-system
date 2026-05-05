"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.currentTraceId = currentTraceId;
exports.requestTraceId = requestTraceId;
exports.runWithJobTraceAsync = runWithJobTraceAsync;
const api_1 = require("@opentelemetry/api");
function currentTraceId() {
    const span = api_1.trace.getActiveSpan();
    const traceId = span?.spanContext().traceId;
    return traceId && traceId !== '0'.repeat(32) ? traceId : undefined;
}
function requestTraceId(req) {
    return currentTraceId() ?? req.requestId ?? 'n/a';
}
async function runWithJobTraceAsync(traceIdHex, spanName, fn) {
    if (!traceIdHex || traceIdHex.length !== 32 || /^0{32}$/i.test(traceIdHex)) {
        return fn();
    }
    const tracer = api_1.trace.getTracer('safari-erp');
    const remote = {
        traceId: traceIdHex,
        spanId: '0000000000000001',
        traceFlags: api_1.TraceFlags.SAMPLED,
        isRemote: true,
    };
    const parentCtx = api_1.trace.setSpanContext(api_1.context.active(), remote);
    return api_1.context.with(parentCtx, () => tracer.startActiveSpan(spanName, async (span) => {
        span.setAttribute('messaging.trace_id_hex', traceIdHex);
        try {
            return await fn();
        }
        finally {
            span.end();
        }
    }));
}
//# sourceMappingURL=trace-context.js.map