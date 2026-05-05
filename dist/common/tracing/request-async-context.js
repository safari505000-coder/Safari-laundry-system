"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestContext = void 0;
exports.requestContextMiddleware = requestContextMiddleware;
exports.pickOrderIdFromRequest = pickOrderIdFromRequest;
const node_async_hooks_1 = require("node:async_hooks");
exports.requestContext = new node_async_hooks_1.AsyncLocalStorage();
function requestContextMiddleware(req, _res, next) {
    const traceId = req.traceId ?? req.requestId;
    const orderId = pickOrderIdFromRequest(req);
    exports.requestContext.run({ traceId, orderId }, () => next());
}
function paramOrderId(v) {
    if (typeof v === 'string' && v.length >= 8) {
        return v;
    }
    if (Array.isArray(v) && typeof v[0] === 'string' && v[0].length >= 8) {
        return v[0];
    }
    return undefined;
}
function pickOrderIdFromRequest(req) {
    const p = paramOrderId(req.params?.orderId) ?? paramOrderId(req.params?.referenceId);
    if (p) {
        return p;
    }
    const b = req.body;
    if (b && typeof b === 'object') {
        for (const k of ['orderId', 'referenceId', 'requested_order_id']) {
            const v = b[k];
            if (typeof v === 'string' && v.length >= 8) {
                return v;
            }
        }
    }
    const q = req.query?.orderId;
    if (typeof q === 'string' && q.length >= 8) {
        return q;
    }
    const path = req.path ?? '';
    const m = path.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
    return m?.[0];
}
//# sourceMappingURL=request-async-context.js.map