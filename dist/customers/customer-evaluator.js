"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateCustomer = evaluateCustomer;
exports.buildInsight = buildInsight;
exports.evaluateCustomerIntelligence = evaluateCustomerIntelligence;
function evaluateCustomer(fin) {
    const debt = toNumber(fin.totalDueKd);
    const consumed = toNumber(fin.subscriptionConsumedKd ?? fin.consumedKd);
    const totalValue = toNumber(fin.subscriptionValueKd);
    const overuse = consumed - totalValue;
    if (fin.isBlocked)
        return 'BLOCKED';
    if (debt > 500 || overuse > 200)
        return 'BLOCKED';
    if (debt > 50 || overuse > 20)
        return 'WATCH';
    return 'GOOD';
}
function buildInsight(fin, rating) {
    void fin;
    if (rating === 'BLOCKED') {
        return '🚫 العميل موقوف بسبب دين عالي أو تجاوز الباقة';
    }
    if (rating === 'WATCH') {
        return '⚠️ العميل يحتاج متابعة بسبب تأخر أو استهلاك عالي';
    }
    return '✅ العميل ملتزم';
}
function evaluateCustomerIntelligence(input) {
    const rating = evaluateCustomer(input);
    const paymentConsistency = clampRatio(input.paymentConsistency ?? 0);
    const avgPaymentDelayHours = Math.max(toNumber(input.avgPaymentDelayHours ?? 0), 0);
    const lifetimeValue = toNumber(input.lifetimeValueKd ?? 0);
    let customerHealth = rating === 'BLOCKED' ? 'BLOCKED'
        : rating === 'WATCH' ? 'WATCH'
            : 'GOOD';
    if (customerHealth !== 'BLOCKED' &&
        (paymentConsistency < 0.6 || avgPaymentDelayHours > 72)) {
        customerHealth = 'RISK';
    }
    return {
        customerHealth,
        paymentConsistency,
        avgPaymentDelayHours: Math.round(avgPaymentDelayHours * 100) / 100,
        lifetimeValueKd: lifetimeValue.toFixed(4),
    };
}
function clampRatio(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}
function toNumber(value) {
    const n = typeof value === 'number' ? value : Number.parseFloat(value);
    return Number.isFinite(n) ? n : 0;
}
//# sourceMappingURL=customer-evaluator.js.map