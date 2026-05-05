"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyCustomerFriendlyPhrases = applyCustomerFriendlyPhrases;
exports.buildCustomerFriendlySummary = buildCustomerFriendlySummary;
exports.sanitizeCustomerView = sanitizeCustomerView;
const NUMERIC_STRING = /^\d+\.\d+$/;
function applyCustomerFriendlyPhrases(text) {
    return text
        .replace(/\bdebt\b/gi, 'المبلغ المستحق')
        .replace(/\boveruse\b/gi, 'تجاوز الباقة');
}
function deepSanitizeCopy(input) {
    if (typeof input === 'string') {
        if (NUMERIC_STRING.test(input.trim())) {
            return input;
        }
        return applyCustomerFriendlyPhrases(input);
    }
    if (input === null || typeof input !== 'object') {
        return input;
    }
    if (Array.isArray(input)) {
        return input.map((x) => deepSanitizeCopy(x));
    }
    const out = {};
    for (const [k, v] of Object.entries(input)) {
        out[k] = deepSanitizeCopy(v);
    }
    return out;
}
function buildCustomerFriendlySummary(statement) {
    const f = statement.financials;
    const subscriptionValue = Number.parseFloat(f.subscriptionValueKd);
    const subscriptionText = Number.isFinite(subscriptionValue) && subscriptionValue > 0 ?
        `قيمة الاشتراك ${f.subscriptionValueKd} د.ك، والمستهلك ${f.subscriptionConsumedKd} د.ك، ` +
            `والمتبقي من الاشتراك ${f.subscriptionRemainingKd} د.ك.`
        : 'لا يوجد اشتراك.';
    return (`إجمالي الفواتير ${f.totalInvoicesKd} د.ك، والمدفوع ${f.totalPaymentsKd} د.ك. ` +
        `المبلغ المطلوب دفعه حالياً ${f.totalDueKd} د.ك. ` +
        subscriptionText);
}
function sanitizeCustomerView(data) {
    const statement = deepSanitizeCopy(data.statement);
    const subscriptions = deepSanitizeCopy(data.subscriptions);
    const subscription = deepSanitizeCopy(data.subscription);
    const customer = deepSanitizeCopy(data.customer);
    return {
        customer,
        subscriptions,
        subscription,
        statement,
        rating: data.rating,
        insight: applyCustomerFriendlyPhrases(data.insight),
        score: null,
        insights: null,
        friendlySummary: buildCustomerFriendlySummary(statement),
    };
}
//# sourceMappingURL=sanitize-customer-360-view.js.map