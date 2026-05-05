"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withPaymentFinalizeSpan = withPaymentFinalizeSpan;
const api_1 = require("@opentelemetry/api");
async function withPaymentFinalizeSpan(attrs, fn) {
    const tracer = api_1.trace.getTracer('safari-erp');
    return tracer.startActiveSpan('payments.finalize', async (span) => {
        if (attrs.orderId) {
            span.setAttribute('order.id', attrs.orderId);
        }
        if (attrs.source) {
            span.setAttribute('payments.source', attrs.source);
        }
        try {
            return await fn();
        }
        catch (err) {
            span.recordException(err);
            throw err;
        }
        finally {
            span.end();
        }
    });
}
//# sourceMappingURL=payment-finalize-span.js.map