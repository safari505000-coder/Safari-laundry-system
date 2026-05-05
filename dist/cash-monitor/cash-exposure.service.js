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
exports.CashExposureService = void 0;
const common_1 = require("@nestjs/common");
const cash_intelligence_v2_service_1 = require("../cash-intelligence/cash-intelligence-v2.service");
const cash_exposure_dto_1 = require("./dto/cash-exposure.dto");
const cash_classifier_service_1 = require("./cash-classifier.service");
const driver_amount_map_1 = require("./driver-amount-map");
const RISK_ORDER = {
    NORMAL: 0,
    WARNING: 1,
    HIGH_RISK: 2,
    CRITICAL: 3,
};
let CashExposureService = class CashExposureService {
    v2;
    classifier;
    constructor(v2, classifier) {
        this.v2 = v2;
        this.classifier = classifier;
    }
    async computeExposure() {
        const analysis = await this.v2.runAnalysis({});
        return this.composeFromAnalysis(analysis);
    }
    composeFromAnalysis(analysis) {
        const generatedAt = new Date().toISOString();
        const classified = this.classifier.composeFromAnalysis(analysis);
        const amountMap = (0, driver_amount_map_1.buildDriverAmountMap)(classified);
        const byDriver = new Map();
        for (const f of analysis.flows) {
            if (f.stage === 'BANK')
                continue;
            const g = ensureGroup(byDriver, f);
            g.batches.push(toBatch(f));
            if (f.ageHours > g.oldestAgeHours) {
                g.oldestAgeHours = f.ageHours;
            }
        }
        const drivers = [];
        const silentAlerts = [];
        let driversAtWarning = 0;
        let driversAtHighRisk = 0;
        let driversAtCritical = 0;
        for (const g of byDriver.values()) {
            const totalKd = (0, driver_amount_map_1.getDriverAmountKd)(amountMap, g.driverId);
            const totalLabel = (0, driver_amount_map_1.getDriverAmountStr)(amountMap, g.driverId);
            const amountRiskLevel = classifyAmountRisk(totalKd);
            const ageRiskLevel = classifyAgeRisk(g.oldestAgeHours);
            const riskLevel = maxRisk(amountRiskLevel, ageRiskLevel);
            const driver = {
                driverId: g.driverId,
                driverName: g.driverName,
                branchId: g.branchId,
                totalExposure: totalLabel,
                batchCount: g.batches.length,
                oldestPendingAgeHours: round2(g.oldestAgeHours),
                amountRiskLevel,
                ageRiskLevel,
                riskLevel,
                batches: g.batches
                    .slice()
                    .sort((a, b) => b.ageHours - a.ageHours),
            };
            drivers.push(driver);
            if (riskLevel === 'WARNING')
                driversAtWarning++;
            else if (riskLevel === 'HIGH_RISK')
                driversAtHighRisk++;
            else if (riskLevel === 'CRITICAL')
                driversAtCritical++;
            if (amountRiskLevel !== 'NORMAL') {
                silentAlerts.push({
                    type: 'AMOUNT_THRESHOLD',
                    level: amountRiskLevel,
                    driverId: g.driverId,
                    driverName: g.driverName,
                    branchId: g.branchId,
                    totalExposure: totalLabel,
                    ageHours: null,
                    message: amountAlertMessage_ar(g.driverName, totalKd, amountRiskLevel),
                    generatedAt,
                });
            }
            if (ageRiskLevel !== 'NORMAL' && ageRiskLevel !== 'WARNING') {
                silentAlerts.push({
                    type: 'AGING_THRESHOLD',
                    level: ageRiskLevel,
                    driverId: g.driverId,
                    driverName: g.driverName,
                    branchId: g.branchId,
                    totalExposure: totalLabel,
                    ageHours: round2(g.oldestAgeHours),
                    message: ageAlertMessage_ar(g.driverName, g.oldestAgeHours, ageRiskLevel),
                    generatedAt,
                });
            }
        }
        drivers.sort((a, b) => {
            const da = parseFloat(a.totalExposure);
            const db = parseFloat(b.totalExposure);
            if (da !== db)
                return db - da;
            return b.oldestPendingAgeHours - a.oldestPendingAgeHours;
        });
        silentAlerts.sort((a, b) => RISK_ORDER[b.level] - RISK_ORDER[a.level]);
        return {
            generatedAt,
            summary: {
                totalDrivers: drivers.length,
                driversAtWarning,
                driversAtHighRisk,
                driversAtCritical,
                totalExposure: (0, driver_amount_map_1.sumClassifiedKdLabel)(classified),
            },
            drivers,
            silentAlerts,
            readOnly: true,
            advisoryOnly: true,
            audience: 'ACCOUNTANT_AND_EXECUTIVE',
        };
    }
};
exports.CashExposureService = CashExposureService;
exports.CashExposureService = CashExposureService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [cash_intelligence_v2_service_1.CashIntelligenceV2Service,
        cash_classifier_service_1.CashClassifierService])
], CashExposureService);
function ensureGroup(map, f) {
    let g = map.get(f.driverId);
    if (!g) {
        g = {
            driverId: f.driverId,
            driverName: f.driverName,
            branchId: f.branchId,
            batches: [],
            oldestAgeHours: 0,
        };
        map.set(f.driverId, g);
    }
    return g;
}
function toBatch(f) {
    return {
        batchId: `${f.driverId}::${f.originDate}::${f.amount}`,
        amount: f.amount,
        originDate: f.originDate,
        ageHours: round2(f.ageHours),
        ageBucket: bucketForAge(f.ageHours),
        stage: f.stage,
    };
}
function bucketForAge(ageHours) {
    const t = cash_exposure_dto_1.EXPOSURE_THRESHOLDS.ageHours;
    if (ageHours >= t.critical)
        return 'CRITICAL';
    if (ageHours >= t.highRisk)
        return 'HIGH_RISK';
    if (ageHours >= t.overdue)
        return 'OVERDUE';
    return 'PENDING';
}
function classifyAmountRisk(totalKd) {
    const a = cash_exposure_dto_1.EXPOSURE_THRESHOLDS.amount;
    if (totalKd >= a.criticalKd)
        return 'CRITICAL';
    if (totalKd >= a.warningKd)
        return 'WARNING';
    return 'NORMAL';
}
function classifyAgeRisk(oldestAgeHours) {
    const t = cash_exposure_dto_1.EXPOSURE_THRESHOLDS.ageHours;
    if (oldestAgeHours >= t.critical)
        return 'CRITICAL';
    if (oldestAgeHours >= t.highRisk)
        return 'HIGH_RISK';
    if (oldestAgeHours >= t.overdue)
        return 'WARNING';
    return 'NORMAL';
}
function maxRisk(a, b) {
    return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
function kdLabel(n) {
    return n.toFixed(4);
}
function amountAlertMessage_ar(name, totalKd, level) {
    const who = name ?? 'سائق';
    const amount = totalKd.toFixed(3);
    if (level === 'CRITICAL') {
        return `انكشاف نقدي حرج: ${who} يحمل ${amount} د.ك (يتجاوز 500 د.ك).`;
    }
    return `انكشاف نقدي مرتفع: ${who} يحمل ${amount} د.ك (يتجاوز 200 د.ك).`;
}
function ageAlertMessage_ar(name, ageHours, level) {
    const who = name ?? 'سائق';
    const days = (ageHours / 24).toFixed(1);
    if (level === 'CRITICAL') {
        return `نقد متراكم منذ أكثر من 72 ساعة: ${who} لديه دفعة عمرها ${days} يوم.`;
    }
    return `نقد قديم بحاجة متابعة: ${who} لديه دفعة عمرها ${days} يوم.`;
}
//# sourceMappingURL=cash-exposure.service.js.map