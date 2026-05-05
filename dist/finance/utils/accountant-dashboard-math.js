"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECONCILIATION_BALANCE_EPS = void 0;
exports.reconciliationDeltaKds = reconciliationDeltaKds;
exports.reconciliationBadgeFromDiff = reconciliationBadgeFromDiff;
exports.kpiTrendDirection = kpiTrendDirection;
exports.RECONCILIATION_BALANCE_EPS = 0.0001;
function reconciliationDeltaKds(collectedKd, handedKd) {
    const delta = handedKd - collectedKd;
    const shortfall = collectedKd - handedKd;
    const deltaKd = delta.toFixed(4);
    const shortfallKd = shortfall.toFixed(4);
    if (Math.abs(delta) <= exports.RECONCILIATION_BALANCE_EPS) {
        return { deltaKd, shortfallKd, status: 'GREEN' };
    }
    if (shortfall > exports.RECONCILIATION_BALANCE_EPS) {
        return { deltaKd, shortfallKd, status: 'RED' };
    }
    if (delta > exports.RECONCILIATION_BALANCE_EPS) {
        return { deltaKd, shortfallKd, status: 'YELLOW' };
    }
    return { deltaKd, shortfallKd, status: 'GREEN' };
}
function reconciliationBadgeFromDiff(diff) {
    if (diff > 0.0001)
        return 'red';
    if (diff < -0.0001)
        return 'yellow';
    return 'green';
}
function kpiTrendDirection(curr, prev) {
    if (prev === 0) {
        return {
            direction: curr > 0 ? 'up' : 'flat',
            pctVsPrevious: curr > 0 ? 100 : 0,
        };
    }
    const raw = ((curr - prev) / prev) * 100;
    const pctVsPrevious = Math.round(raw * 10) / 10;
    let direction = 'flat';
    if (pctVsPrevious > 0.5)
        direction = 'up';
    else if (pctVsPrevious < -0.5)
        direction = 'down';
    return { direction, pctVsPrevious };
}
//# sourceMappingURL=accountant-dashboard-math.js.map