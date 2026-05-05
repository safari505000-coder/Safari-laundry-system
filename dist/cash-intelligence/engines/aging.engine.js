"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.kuwaitCalendarDiff = kuwaitCalendarDiff;
function kuwaitCalendarDiff(originDay, todayDay) {
    const o = parseKuwaitDay(originDay);
    const t = parseKuwaitDay(todayDay);
    const ms = t.getTime() - o.getTime();
    if (ms <= 0)
        return 0;
    return Math.floor(ms / 86_400_000);
}
function parseKuwaitDay(day) {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}
//# sourceMappingURL=aging.engine.js.map