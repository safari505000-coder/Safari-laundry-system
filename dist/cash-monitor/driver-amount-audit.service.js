"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DriverAmountAuditService = void 0;
const common_1 = require("@nestjs/common");
const cash_monitor_service_1 = require("./cash-monitor.service");
const cash_risk_service_1 = require("./cash-risk.service");
const cash_executive_service_1 = require("./cash-executive.service");
const MISMATCH_THRESHOLD_KD = 0.01;
const CRITICAL_AMOUNT_KD = 5;
let DriverAmountAuditService = class DriverAmountAuditService {
    monitor;
    risk;
    executive;
    constructor(monitor, risk, executive) {
        this.monitor = monitor;
        this.risk = risk;
        this.executive = executive;
    }
    async run() {
        const live = await this.monitor.getLive();
        const [operational, classified, executive, risk] = await Promise.all([
            this.monitor.getOperationalView(),
            this.monitor.getClassified(),
            this.executive.getExecutiveView(),
            this.risk.computeRisk(),
        ]);
        const buckets = this.buildBuckets({
            classified,
            risk,
            live,
            operational,
            executive,
        });
        const mismatches = [];
        const matched = [];
        for (const b of buckets.values()) {
            const row = this.buildRow(b);
            const deltaNum = parseFloat(row.difference);
            if (deltaNum > MISMATCH_THRESHOLD_KD) {
                mismatches.push(row);
            }
            else {
                matched.push(row);
            }
        }
        mismatches.sort((a, b) => {
            const da = parseFloat(a.difference) - parseFloat(b.difference);
            if (da !== 0)
                return -da;
            return a.driverId.localeCompare(b.driverId);
        });
        matched.sort((a, b) => a.driverId.localeCompare(b.driverId));
        const criticalDrivers = mismatches.filter((m) => parseFloat(m.difference) >= CRITICAL_AMOUNT_KD).length;
        return {
            status: mismatches.length === 0 ? 'PASS' : 'FAIL',
            totalDrivers: buckets.size,
            mismatches,
            matched,
            summary: {
                totalMismatches: mismatches.length,
                criticalDrivers,
                layersChecked: 5,
            },
            generatedAt: new Date().toISOString(),
            readOnly: true,
        };
    }
    buildBuckets(input) {
        const buckets = new Map();
        for (const d of input.classified.drivers) {
            const b = ensure(buckets, d.driverId, d.driverName);
            b.snap.classified = parseAmount(d.amount);
        }
        for (const d of input.risk.drivers) {
            const b = ensure(buckets, d.driverId, d.driverName);
            b.snap.risk = parseAmount(d.totalCash);
        }
        for (const d of input.live.driversAtRisk) {
            const b = ensure(buckets, d.driverId, d.driverName);
            b.snap.live = parseAmount(d.totalCash);
        }
        const setOpAmount = (d) => {
            const b = ensure(buckets, d.driverId, d.driverName);
            b.snap.operational = parseAmount(d.totalCash);
        };
        for (const d of input.operational.activeDrivers)
            setOpAmount(d);
        for (const d of input.operational.driversAtRisk)
            setOpAmount(d);
        if (input.executive.topRisk?.driverId) {
            const t = input.executive.topRisk;
            const id = t.driverId;
            const b = ensure(buckets, id, t.driverName);
            b.snap.executive = parseAmount(t.amount);
        }
        const silent = input.executive.silentAlerts;
        if (silent) {
            for (const sa of silent) {
                if (sa.driverId) {
                    const b = ensure(buckets, sa.driverId, sa.driverName);
                    if (sa.totalExposure !== null && sa.totalExposure !== undefined) {
                        b.snap.executive = parseAmount(sa.totalExposure);
                    }
                }
            }
        }
        return buckets;
    }
    buildRow(b) {
        const presence = {
            classified: b.snap.classified !== null,
            risk: b.snap.risk !== null,
            live: b.snap.live !== null,
            operational: b.snap.operational !== null,
            executive: b.snap.executive !== null,
        };
        const amounts = {
            classified: formatAmount(b.snap.classified),
            risk: formatAmount(b.snap.risk),
            live: formatAmount(b.snap.live),
            operational: formatAmount(b.snap.operational),
            executive: formatAmount(b.snap.executive),
        };
        const numeric = {
            classified: b.snap.classified ?? 0,
            risk: b.snap.risk ?? 0,
            live: b.snap.live ?? 0,
            operational: b.snap.operational ?? 0,
            executive: b.snap.executive ?? 0,
        };
        const populated = [
            b.snap.classified,
            b.snap.risk,
            b.snap.live,
            b.snap.operational,
            b.snap.executive,
        ].filter((v) => v !== null);
        const maxAmount = populated.length > 0 ? Math.max(...populated) : 0;
        const minAmount = populated.length > 0 ? Math.min(...populated) : 0;
        const difference = populated.length > 1 ? round4(maxAmount - minAmount) : 0;
        const { rootCause, reasons } = this.classify({
            numeric,
            presence,
            difference,
        });
        const severity = difference >= CRITICAL_AMOUNT_KD ? 'CRITICAL' : 'WARNING';
        return {
            driverId: b.driverId,
            driverName: b.driverName,
            amounts,
            presence,
            difference: difference.toFixed(4),
            minAmount: minAmount.toFixed(4),
            maxAmount: maxAmount.toFixed(4),
            severity,
            rootCause,
            reasons,
        };
    }
    classify(input) {
        const { numeric, presence } = input;
        const reasons = [];
        const causes = new Set();
        if (Math.abs(numeric.classified - numeric.risk) > MISMATCH_THRESHOLD_KD) {
            causes.add('CLASSIFICATION_DRIFT');
            reasons.push(`classified=${numeric.classified.toFixed(4)} ≠ risk=${numeric.risk.toFixed(4)} (Δ ${(numeric.classified - numeric.risk).toFixed(4)} KD)`);
        }
        if (presence.live &&
            Math.abs(numeric.classified - numeric.live) > MISMATCH_THRESHOLD_KD) {
            causes.add('SNAPSHOT_DRIFT');
            reasons.push(`classified=${numeric.classified.toFixed(4)} ≠ live=${numeric.live.toFixed(4)} (Δ ${(numeric.classified - numeric.live).toFixed(4)} KD)`);
        }
        if (presence.operational &&
            Math.abs(numeric.classified - numeric.operational) > MISMATCH_THRESHOLD_KD) {
            causes.add('FILTERING_BUG');
            reasons.push(`operational=${numeric.operational.toFixed(4)} ≠ classified=${numeric.classified.toFixed(4)} (Δ ${(numeric.operational - numeric.classified).toFixed(4)} KD)`);
        }
        if (presence.executive &&
            Math.abs(numeric.classified - numeric.executive) > MISMATCH_THRESHOLD_KD) {
            causes.add('EXECUTIVE_PROJECTION_BUG');
            reasons.push(`executive=${numeric.executive.toFixed(4)} ≠ classified=${numeric.classified.toFixed(4)} (Δ ${(numeric.executive - numeric.classified).toFixed(4)} KD)`);
        }
        const populatedCount = countTrue([
            presence.classified,
            presence.risk,
            presence.live,
            presence.operational,
            presence.executive,
        ]);
        const numericByLayer = [
            ['classified', numeric.classified, presence.classified],
            ['risk', numeric.risk, presence.risk],
            ['live', numeric.live, presence.live],
            ['operational', numeric.operational, presence.operational],
            ['executive', numeric.executive, presence.executive],
        ];
        const layersAboveThreshold = numericByLayer.filter(([, v, p]) => p && v > MISMATCH_THRESHOLD_KD);
        if (layersAboveThreshold.length === 1 &&
            populatedCount > 1 &&
            input.difference >= CRITICAL_AMOUNT_KD) {
            causes.add('PARTIAL_DATA_OR_STALE_CACHE');
            const lone = layersAboveThreshold[0];
            reasons.push(`only ${lone[0]} reports a meaningful value (${lone[1].toFixed(4)} KD); other ${populatedCount - 1} populated layers are at zero.`);
        }
        if (causes.size === 0) {
            return {
                rootCause: 'PARTIAL_DATA_OR_STALE_CACHE',
                reasons: [
                    `delta ${input.difference.toFixed(4)} KD detected but no specific layer pair disagrees — likely a presence gap.`,
                ],
            };
        }
        if (causes.size === 1) {
            return { rootCause: [...causes][0], reasons };
        }
        return { rootCause: 'MIXED_DRIFT', reasons };
    }
};
exports.DriverAmountAuditService = DriverAmountAuditService;
exports.DriverAmountAuditService = DriverAmountAuditService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [cash_monitor_service_1.CashMonitorService,
        cash_risk_service_1.CashRiskService,
        cash_executive_service_1.CashExecutiveService])
], DriverAmountAuditService);
function ensure(map, driverId, driverName) {
    let b = map.get(driverId);
    if (!b) {
        b = {
            driverId,
            driverName: driverName ?? null,
            snap: {
                classified: null,
                risk: null,
                live: null,
                operational: null,
                executive: null,
            },
        };
        map.set(driverId, b);
    }
    else if (!b.driverName && driverName) {
        b.driverName = driverName;
    }
    return b;
}
function parseAmount(raw) {
    if (raw === null || raw === undefined)
        return 0;
    const n = Number.parseFloat(String(raw));
    return Number.isFinite(n) ? round4(n) : 0;
}
function formatAmount(n) {
    if (n === null)
        return null;
    return n.toFixed(4);
}
function round4(n) {
    return Math.round(n * 10_000) / 10_000;
}
function countTrue(arr) {
    let c = 0;
    for (const v of arr)
        if (v)
            c += 1;
    return c;
}
//# sourceMappingURL=driver-amount-audit.service.js.map