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
var CashExplainService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CashExplainService = void 0;
const common_1 = require("@nestjs/common");
const cash_monitor_service_1 = require("./cash-monitor.service");
const cash_classifier_service_1 = require("./cash-classifier.service");
const driver_amount_map_1 = require("./driver-amount-map");
const RECONCILIATION_TOLERANCE_KD = 0.0001;
let CashExplainService = CashExplainService_1 = class CashExplainService {
    monitor;
    classifier;
    logger = new common_1.Logger(CashExplainService_1.name);
    constructor(monitor, classifier) {
        this.monitor = monitor;
        this.classifier = classifier;
    }
    async getExplain() {
        const snapshot = await this.monitor.peekSnapshot();
        return this.composeFromAnalysis(snapshot);
    }
    composeFromAnalysis(snapshot) {
        const now = new Date();
        if (!snapshot) {
            return {
                generatedAt: now.toISOString(),
                totalDrivers: 0,
                totalCash: '0.0000',
                drivers: [],
                readOnly: true,
                advisoryOnly: true,
            };
        }
        const classified = this.classifier.composeFromAnalysis(snapshot);
        const amountMap = (0, driver_amount_map_1.buildDriverAmountMap)(classified);
        const flowsByDriver = new Map();
        for (const f of snapshot.flows) {
            if (!f.driverId)
                continue;
            if (parseAmount(f.amount) <= 0)
                continue;
            const list = flowsByDriver.get(f.driverId) ?? [];
            list.push(f);
            flowsByDriver.set(f.driverId, list);
        }
        const drivers = [];
        for (const [driverId, flows] of flowsByDriver) {
            const driver = composeDriver(driverId, flows, amountMap);
            drivers.push(driver);
            this.assertBucketReconciliation(driver);
        }
        drivers.sort((a, b) => {
            const diff = parseAmount(b.totalCash) - parseAmount(a.totalCash);
            if (diff !== 0)
                return diff;
            return a.driverId.localeCompare(b.driverId);
        });
        return {
            generatedAt: now.toISOString(),
            totalDrivers: drivers.length,
            totalCash: (0, driver_amount_map_1.sumClassifiedKdLabel)(classified),
            drivers,
            readOnly: true,
            advisoryOnly: true,
        };
    }
    assertBucketReconciliation(driver) {
        const bucketSum = driver.breakdown.reduce((s, b) => s + parseAmount(b.amount), 0);
        const driverTotal = parseAmount(driver.totalCash);
        const delta = Math.abs(bucketSum - driverTotal);
        if (delta <= RECONCILIATION_TOLERANCE_KD)
            return;
        const msg = `cash-explain bucket drift: driver=${driver.driverId} bucketSum=${bucketSum.toFixed(4)} classifiedAmount=${driverTotal.toFixed(4)} delta=${delta.toFixed(4)} KD`;
        this.logger.error(msg);
        if (process.env.NODE_ENV !== 'production') {
            throw new Error(msg);
        }
    }
};
exports.CashExplainService = CashExplainService;
exports.CashExplainService = CashExplainService = CashExplainService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [cash_monitor_service_1.CashMonitorService,
        cash_classifier_service_1.CashClassifierService])
], CashExplainService);
function composeDriver(driverId, flows, amountMap) {
    const buckets = new Map();
    let oldestAgeHours = 0;
    let oldestDate = null;
    for (const f of flows) {
        const amountKd = parseAmount(f.amount);
        const bucket = buckets.get(f.originDate) ?? { amount: 0, count: 0 };
        bucket.amount += amountKd;
        bucket.count += 1;
        buckets.set(f.originDate, bucket);
        if (f.ageHours > oldestAgeHours) {
            oldestAgeHours = f.ageHours;
            oldestDate = f.originDate;
        }
    }
    if (oldestDate === null && buckets.size > 0) {
        oldestDate = [...buckets.keys()].sort()[0];
    }
    const breakdown = [...buckets.entries()]
        .map(([date, b]) => ({
        date,
        amount: kdToFixed4(b.amount),
        count: b.count,
    }))
        .sort((a, b) => a.date.localeCompare(b.date));
    const lead = flows[0];
    return {
        driverId,
        driverName: lead?.driverName ?? null,
        branchId: lead?.branchId ?? null,
        totalCash: (0, driver_amount_map_1.getDriverAmountStr)(amountMap, driverId),
        oldestCashAgeHours: round2(oldestAgeHours),
        oldestOriginDate: oldestDate,
        flowCount: flows.length,
        breakdown,
    };
}
function parseAmount(s) {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
}
function kdToFixed4(n) {
    return n.toFixed(4);
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
//# sourceMappingURL=cash-explain.service.js.map