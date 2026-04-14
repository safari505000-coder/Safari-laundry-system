"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HANDOVER_TOLERANCE_MINOR = void 0;
exports.toMinorFromFixed4 = toMinorFromFixed4;
exports.parseFixed4ToMinor = parseFixed4ToMinor;
exports.declaredNumberToMinor = declaredNumberToMinor;
exports.sumOrderMinors = sumOrderMinors;
exports.minorToAmountString = minorToAmountString;
exports.assertDeclaredMatchesLedgerMinor = assertDeclaredMatchesLedgerMinor;
const SCALE = 4;
const MULTIPLIER = 10n ** BigInt(SCALE);
exports.HANDOVER_TOLERANCE_MINOR = 1n;
function toMinorFromFixed4(totalPrice) {
    return parseFixed4ToMinor(totalPrice.toFixed(4));
}
function parseFixed4ToMinor(s) {
    const t = s.trim();
    const neg = t.startsWith('-');
    const u = neg ? t.slice(1) : t;
    const [wRaw, fRaw = ''] = u.split('.');
    const w = wRaw === '' ? '0' : wRaw;
    const frac = (fRaw + '0000').slice(0, SCALE).padEnd(SCALE, '0');
    const minor = BigInt(w) * MULTIPLIER + BigInt(frac);
    return neg ? -minor : minor;
}
function declaredNumberToMinor(declared) {
    if (!Number.isFinite(declared) || declared <= 0) {
        throw new Error('declaredHandoverTotal must be a finite positive number');
    }
    return parseFixed4ToMinor(declared.toFixed(4));
}
function sumOrderMinors(rows) {
    return rows.reduce((a, o) => a + toMinorFromFixed4(o.totalPrice), 0n);
}
function minorToAmountString(minor) {
    const neg = minor < 0n;
    const v = neg ? -minor : minor;
    const intPart = v / MULTIPLIER;
    const fracPart = (v % MULTIPLIER).toString().padStart(SCALE, '0');
    return `${neg ? '-' : ''}${intPart}.${fracPart}`;
}
function assertDeclaredMatchesLedgerMinor(ledgerMinor, declared) {
    const declaredMinor = declaredNumberToMinor(declared);
    const diff = ledgerMinor >= declaredMinor
        ? ledgerMinor - declaredMinor
        : declaredMinor - ledgerMinor;
    if (diff > exports.HANDOVER_TOLERANCE_MINOR) {
        throw new Error(`Declared total ${minorToAmountString(declaredMinor)} does not match ledger ${minorToAmountString(ledgerMinor)} (tolerance ±${minorToAmountString(exports.HANDOVER_TOLERANCE_MINOR)} KWD)`);
    }
}
//# sourceMappingURL=finance-money.js.map