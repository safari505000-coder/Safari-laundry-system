"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDriverAmountMap = buildDriverAmountMap;
exports.getDriverAmountStr = getDriverAmountStr;
exports.getDriverAmountKd = getDriverAmountKd;
exports.sumClassifiedKd = sumClassifiedKd;
exports.sumClassifiedKdLabel = sumClassifiedKdLabel;
exports.getDriverAmountFromSSoT = getDriverAmountFromSSoT;
function buildDriverAmountMap(classified) {
    const m = new Map();
    for (const d of classified.drivers) {
        m.set(d.driverId, d.amount);
    }
    return m;
}
function getDriverAmountStr(map, driverId) {
    return map.get(driverId) ?? '0.0000';
}
function getDriverAmountKd(map, driverId) {
    const s = map.get(driverId);
    if (!s)
        return 0;
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
}
function sumClassifiedKd(classified) {
    let s = 0;
    for (const d of classified.drivers) {
        const n = Number(d.amount);
        if (Number.isFinite(n))
            s += n;
    }
    return s;
}
function sumClassifiedKdLabel(classified) {
    return sumClassifiedKd(classified).toFixed(4);
}
function getDriverAmountFromSSoT(map, driverId) {
    return getDriverAmountStr(map, driverId);
}
//# sourceMappingURL=driver-amount-map.js.map