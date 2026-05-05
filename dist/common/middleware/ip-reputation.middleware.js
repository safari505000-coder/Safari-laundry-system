"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ipReputationMiddleware = ipReputationMiddleware;
const ip_reputation_hook_1 = require("../security/ip-reputation.hook");
function ipReputationMiddleware(req, res, next) {
    const reason = (0, ip_reputation_hook_1.hasBlockedClientIp)(req.ip, req.socket?.remoteAddress);
    if (reason) {
        res.status(403).json({ status: 'forbidden', code: 'ip_reputation', reason });
        return;
    }
    next();
}
//# sourceMappingURL=ip-reputation.middleware.js.map