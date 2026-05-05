"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasBlockedClientIp = hasBlockedClientIp;
function parseBlocklist(raw) {
    const s = new Set();
    if (!raw?.trim()) {
        return s;
    }
    for (const part of raw.split(/[,\s]+/)) {
        const t = part.trim();
        if (t) {
            s.add(t);
        }
    }
    return s;
}
const BLOCKLIST = parseBlocklist(process.env.IP_REPUTATION_BLOCKLIST);
function hasBlockedClientIp(expressIp, remote) {
    if (process.env.IP_REPUTATION_ENABLED !== 'true' || BLOCKLIST.size === 0) {
        return null;
    }
    const candidates = [expressIp, remote].filter(Boolean);
    for (const c of candidates) {
        if (BLOCKLIST.has(c)) {
            return 'blocklist_match';
        }
    }
    return null;
}
//# sourceMappingURL=ip-reputation.hook.js.map