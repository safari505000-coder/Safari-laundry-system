"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDebtKdBreakdownTrace = buildDebtKdBreakdownTrace;
const client_1 = require("@prisma/client");
const EPS = new client_1.Prisma.Decimal('0.0001');
function approxEq(a, b) {
    return a.sub(b).abs().lte(EPS);
}
function buildDebtKdBreakdownTrace(ledgerNetKd, walletSnapshotKd, orderMarketScopeKd, effectiveKd) {
    const winningSources = [];
    if (approxEq(ledgerNetKd, effectiveKd))
        winningSources.push('ledger');
    if (approxEq(walletSnapshotKd, effectiveKd))
        winningSources.push('walletSnapshot');
    if (approxEq(orderMarketScopeKd, effectiveKd))
        winningSources.push('orderMarket');
    if (winningSources.length === 0) {
        winningSources.push('walletSnapshot');
    }
    return {
        ledgerNetKd: ledgerNetKd.toFixed(4),
        walletSnapshotKd: walletSnapshotKd.toFixed(4),
        orderMarketScopeKd: orderMarketScopeKd.toFixed(4),
        effectiveDebtKd: effectiveKd.toFixed(4),
        winningSources,
    };
}
//# sourceMappingURL=debt-kd-breakdown.util.js.map