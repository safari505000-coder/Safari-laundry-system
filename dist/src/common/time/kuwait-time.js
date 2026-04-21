"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KUWAIT_TIMEZONE = exports.KUWAIT_OFFSET_MIN = void 0;
exports.kuwaitMidnightUtc = kuwaitMidnightUtc;
exports.nextKuwaitMidnightUtc = nextKuwaitMidnightUtc;
exports.kuwaitHour = kuwaitHour;
exports.kuwaitDayIso = kuwaitDayIso;
exports.isSameKuwaitDay = isSameKuwaitDay;
exports.KUWAIT_OFFSET_MIN = 180;
exports.KUWAIT_TIMEZONE = 'Asia/Kuwait';
function kuwaitMidnightUtc(nowUtc) {
    const k = new Date(nowUtc.getTime() + exports.KUWAIT_OFFSET_MIN * 60_000);
    const y = k.getUTCFullYear();
    const m = k.getUTCMonth();
    const d = k.getUTCDate();
    const utcMs = Date.UTC(y, m, d, 0, 0, 0, 0) - exports.KUWAIT_OFFSET_MIN * 60_000;
    return new Date(utcMs);
}
function nextKuwaitMidnightUtc(nowUtc) {
    const today = kuwaitMidnightUtc(nowUtc);
    return new Date(today.getTime() + 24 * 60 * 60 * 1000);
}
function kuwaitHour(nowUtc) {
    const k = new Date(nowUtc.getTime() + exports.KUWAIT_OFFSET_MIN * 60_000);
    return k.getUTCHours();
}
function kuwaitDayIso(nowUtc) {
    const k = new Date(nowUtc.getTime() + exports.KUWAIT_OFFSET_MIN * 60_000);
    const y = k.getUTCFullYear();
    const m = String(k.getUTCMonth() + 1).padStart(2, '0');
    const d = String(k.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
function isSameKuwaitDay(a, b) {
    return kuwaitDayIso(a) === kuwaitDayIso(b);
}
//# sourceMappingURL=kuwait-time.js.map