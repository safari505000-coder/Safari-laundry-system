"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestIdMiddleware = requestIdMiddleware;
const node_crypto_1 = require("node:crypto");
function requestIdMiddleware(req, res, next) {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && incoming.trim().length > 0 ?
        incoming.trim()
        : (0, node_crypto_1.randomUUID)();
    req.requestId = id;
    res.setHeader('X-Request-ID', id);
    next();
}
//# sourceMappingURL=request-id.middleware.js.map