"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REAL_PAYMENT_SOURCE_REF_PREFIXES = void 0;
exports.isRealDebtLedgerPayment = isRealDebtLedgerPayment;
exports.assertDebtLedgerPaymentWrite = assertDebtLedgerPaymentWrite;
exports.traceDebtLedgerPaymentWrite = traceDebtLedgerPaymentWrite;
const client_1 = require("@prisma/client");
exports.REAL_PAYMENT_SOURCE_REF_PREFIXES = [
    'PAYMENT:CASH:',
    'PAYMENT:KNET:',
    'PAYMENT:ONLINE:',
    'PAYMENT:PAYMENT_LINK:',
    'PAYMENT:CALL_CENTER_MANUAL:',
    'PAYMENT:PAYMENT_LINK_CALLBACK:',
    'PAYMENT:SUBSCRIPTION_ACTIVATION:',
    'PAYMENT:CC_DEBT_INVOICE_PHYSICAL:',
    'PAYMENT:CC_PARTIAL_DEBT_PAYMENT:',
];
const NON_MONEY_SOURCE_REF_PREFIXES = [
    'ADJUSTMENT:',
    'REFUND:',
    'WRITE_OFF:',
    'TRANSFER:',
    'MIGRATION:',
];
const NON_MONEY_NOTE_PATTERNS = [
    'reversed by invoice void',
    'invoice void',
    'invoice edit',
    'write-off',
    'migration',
];
function isRealDebtLedgerPayment(entry) {
    if (entry.source !== client_1.DebtSource.PAYMENT && entry.source !== 'PAYMENT') {
        return false;
    }
    const amount = new client_1.Prisma.Decimal(entry.amount.toString());
    if (amount.lessThanOrEqualTo(0))
        return false;
    const sourceRef = entry.sourceRef?.trim() ?? '';
    if (NON_MONEY_SOURCE_REF_PREFIXES.some((prefix) => sourceRef.startsWith(prefix))) {
        return false;
    }
    if (sourceRef &&
        exports.REAL_PAYMENT_SOURCE_REF_PREFIXES.some((prefix) => sourceRef.startsWith(prefix))) {
        return true;
    }
    if (!entry.actorUserId)
        return false;
    const note = entry.note?.toLowerCase() ?? '';
    return !NON_MONEY_NOTE_PATTERNS.some((pattern) => note.includes(pattern));
}
function assertDebtLedgerPaymentWrite(input) {
    if (input.source !== client_1.DebtSource.PAYMENT && input.source !== 'PAYMENT') {
        return;
    }
    if (!input.sourceRef?.trim()) {
        throw new Error('PAYMENT_ORIGIN_REQUIRED');
    }
    if (!input.actorUserId) {
        throw new Error('PAYMENT_ACTOR_REQUIRED');
    }
    if (!exports.REAL_PAYMENT_SOURCE_REF_PREFIXES.some((prefix) => input.sourceRef.startsWith(prefix))) {
        throw new Error('INVALID_PAYMENT_SOURCE');
    }
}
function traceDebtLedgerPaymentWrite(input) {
    console.warn('[LEDGER_WRITE_TRACE]', input);
    console.log('[PAYMENT_CREATED]', input.payload);
}
//# sourceMappingURL=debt-ledger-payment-origin.util.js.map