"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fixed4ToMinor = fixed4ToMinor;
exports.minorToFixed4 = minorToFixed4;
exports.absMinor = absMinor;
function fixed4ToMinor(value) {
    if (value === null || value === undefined)
        return 0n;
    const raw = typeof value === 'string'
        ? value
        : typeof value === 'number'
            ? value.toFixed(4)
            : value.toFixed(4);
    const trimmed = raw.trim();
    const sign = trimmed.startsWith('-') ? -1n : 1n;
    const clean = trimmed.replace(/^-/, '');
    const [whole, frac = ''] = clean.split('.');
    const frac4 = `${frac}0000`.slice(0, 4);
    return sign * (BigInt(whole || '0') * 10000n + BigInt(frac4));
}
function minorToFixed4(value) {
    const sign = value < 0n ? '-' : '';
    const abs = value < 0n ? -value : value;
    const whole = abs / 10000n;
    const frac = (abs % 10000n).toString().padStart(4, '0');
    return `${sign}${whole}.${frac}`;
}
function absMinor(value) {
    return value < 0n ? -value : value;
}
//# sourceMappingURL=money.util.js.map