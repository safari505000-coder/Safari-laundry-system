"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scopeLiveByBranch = scopeLiveByBranch;
exports.scopeOperationalByBranch = scopeOperationalByBranch;
exports.scopeDecisionsByBranch = scopeDecisionsByBranch;
exports.scopeRiskByBranch = scopeRiskByBranch;
exports.scopeClassifiedByBranch = scopeClassifiedByBranch;
exports.scopeExplainByBranch = scopeExplainByBranch;
const driver_amount_map_1 = require("./driver-amount-map");
function scopeLiveByBranch(live, branchId, scopedClassified) {
    const matches = (b) => b === branchId;
    const alerts = live.alerts.filter((a) => matches(a.branchId));
    const preRisk = live.preRisk.filter((a) => matches(a.branchId));
    const amountMap = (0, driver_amount_map_1.buildDriverAmountMap)(scopedClassified);
    const driversAtRisk = live.driversAtRisk
        .filter((d) => matches(d.branchId))
        .map((d) => ({
        ...d,
        totalCash: (0, driver_amount_map_1.getDriverAmountStr)(amountMap, d.driverId),
    }));
    return {
        ...live,
        alerts,
        preRisk,
        driversAtRisk,
        activeDrivers: driversAtRisk.length,
        realtimeStatus: scopedClassified.systemStatus,
        summary: {
            ...live.summary,
            driversAtRisk: driversAtRisk.length,
            activeAnomalies: alerts.length,
            openShifts: driversAtRisk.filter((d) => d.shiftStatus === 'OPEN').length,
            totalCash: (0, driver_amount_map_1.sumClassifiedKdLabel)(scopedClassified),
        },
    };
}
function scopeOperationalByBranch(view, branchId, scopedClassified) {
    const matches = (b) => b === branchId;
    const amountMap = (0, driver_amount_map_1.buildDriverAmountMap)(scopedClassified);
    const rebrand = (d) => ({
        ...d,
        totalCash: (0, driver_amount_map_1.getDriverAmountStr)(amountMap, d.driverId),
    });
    const allDrivers = view.activeDrivers
        .filter((d) => matches(d.branchId))
        .map(rebrand);
    const driversAtRisk = view.driversAtRisk
        .filter((d) => matches(d.branchId))
        .map(rebrand);
    const alerts = view.alerts.filter((a) => matches(a.branchId));
    return {
        ...view,
        activeDrivers: allDrivers,
        driversAtRisk,
        alerts,
        summary: {
            ...view.summary,
            totalDriversShown: allDrivers.length,
            driversAtRisk: driversAtRisk.length,
            activeAlerts: alerts.length,
            totalCash: (0, driver_amount_map_1.sumClassifiedKdLabel)(scopedClassified),
        },
        realtimeStatus: scopedClassified.systemStatus,
    };
}
function scopeDecisionsByBranch(res, branchId) {
    const matches = (b) => b === branchId;
    const actions = res.actions.filter((a) => matches(a.branchId));
    const financialOnly = actions.filter((a) => a.domain === 'FINANCIAL');
    const top = res.topRisk && matches(res.topRisk.branchId) ? res.topRisk : null;
    const summary = countByUrgency(actions);
    return {
        ...res,
        actions,
        topRisk: top ?? pickTopAction(financialOnly),
        summary: {
            critical: summary.critical,
            warning: summary.warning,
            info: summary.info,
            totalActions: actions.length,
        },
        realtimeStatus: trafficLightFromUrgency(summary, res.realtimeStatus),
    };
}
function scopeRiskByBranch(res, branchId, scopedClassified) {
    const amountMap = (0, driver_amount_map_1.buildDriverAmountMap)(scopedClassified);
    const drivers = res.drivers
        .filter((d) => d.branchId === branchId)
        .map((d) => ({
        ...d,
        totalCash: (0, driver_amount_map_1.getDriverAmountStr)(amountMap, d.driverId),
    }));
    const anomalies = res.anomalies.filter((a) => a.branchId === branchId);
    const driversAtRisk = drivers.filter((d) => d.status === 'RISK' || d.status === 'CRITICAL').length;
    let agedKd = 0;
    let newKd = 0;
    for (const d of drivers) {
        for (const row of d.breakdown) {
            const n = parseAmount(row.amount);
            if (!Number.isFinite(n))
                continue;
            if (row.classification === 'AGED')
                agedKd += n;
            else
                newKd += n;
        }
    }
    return {
        ...res,
        systemStatus: scopedClassified.systemStatus,
        summary: {
            totalCash: (0, driver_amount_map_1.sumClassifiedKdLabel)(scopedClassified),
            totalDrivers: drivers.length,
            driversAtRisk,
            agedCash: agedKd.toFixed(4),
            newCash: newKd.toFixed(4),
        },
        drivers,
        anomalies,
    };
}
function scopeClassifiedByBranch(res, branchId) {
    const financialAlerts = res.financialAlerts.filter((a) => a.branchId === branchId);
    const complianceAlerts = res.complianceAlerts.filter((a) => a.branchId === branchId);
    const drivers = res.drivers.filter((d) => d.branchId === branchId);
    const systemStatus = financialAlerts.some((a) => a.severity === 'CRITICAL')
        ? 'RED'
        : financialAlerts.some((a) => a.severity === 'WARNING')
            ? 'YELLOW'
            : 'GREEN';
    return {
        ...res,
        systemStatus,
        financialAlerts,
        complianceAlerts,
        drivers,
    };
}
function scopeExplainByBranch(res, branchId, scopedClassified) {
    const amountMap = (0, driver_amount_map_1.buildDriverAmountMap)(scopedClassified);
    const drivers = res.drivers
        .filter((d) => d.branchId === branchId)
        .map((d) => ({
        ...d,
        totalCash: (0, driver_amount_map_1.getDriverAmountStr)(amountMap, d.driverId),
    }));
    return {
        ...res,
        totalDrivers: drivers.length,
        totalCash: (0, driver_amount_map_1.sumClassifiedKdLabel)(scopedClassified),
        drivers,
    };
}
function parseAmount(s) {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
}
function pickTopAction(actions) {
    if (actions.length === 0)
        return null;
    const top = actions[0];
    return {
        driverId: top.driverId,
        driverName: top.driverName,
        branchId: top.branchId,
        amount: top.amount,
        issue: top.reason,
        action: top.action,
        urgency: top.urgency,
        recommendedSteps: top.recommendedSteps,
        alertType: top.alertType,
    };
}
function countByUrgency(actions) {
    let critical = 0;
    let warning = 0;
    let info = 0;
    for (const a of actions) {
        if (a.urgency === 'HIGH')
            critical++;
        else if (a.urgency === 'MEDIUM')
            warning++;
        else
            info++;
    }
    return { critical, warning, info };
}
function trafficLightFromUrgency(s, fallback) {
    if (s.critical > 0)
        return 'RED';
    if (s.warning > 0)
        return 'YELLOW';
    if (s.critical === 0 && s.warning === 0)
        return 'GREEN';
    return fallback;
}
//# sourceMappingURL=scope-by-branch.js.map