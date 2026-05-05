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
exports.CashClassifierService = void 0;
const common_1 = require("@nestjs/common");
const cash_intelligence_v2_service_1 = require("../cash-intelligence/cash-intelligence-v2.service");
const prisma_service_1 = require("../prisma/prisma.service");
const cash_rules_1 = require("./cash-rules");
const GRACE_PERIOD_HOURS = cash_rules_1.CASH_RULES.GRACE_HOURS;
const SMALL_AMOUNT_FLOOR_KD = cash_rules_1.CASH_RULES.MIN_CRITICAL_AMOUNT_KD;
const FINANCIAL_CHAIN_TYPES = new Set([
    'DEPOSIT_NOT_REGISTERED',
    'DEPOSIT_AMOUNT_MISMATCH',
    'OVERPAYMENT_ANOMALY',
    'DOUBLE_COUNT_RISK',
]);
const COMPLIANCE_TYPES = new Set([
    'SHIFT_OVERDUE',
]);
const AGING_TYPES = new Set([
    'STUCK_AT_DRIVER',
    'HANDOVER_DELAY',
    'CUSTODY_DELAY',
    'SUBSCRIPTION_LEAKAGE',
]);
let CashClassifierService = class CashClassifierService {
    v2;
    prisma;
    constructor(v2, prisma) {
        this.v2 = v2;
        this.prisma = prisma;
    }
    async classify() {
        const analysis = await this.v2.runAnalysis({});
        const projection = this.composeFromAnalysis(analysis);
        const holderIds = projection.drivers
            .map((d) => d.driverId)
            .filter((id) => Boolean(id));
        if (holderIds.length === 0)
            return projection;
        const users = await this.prisma.user.findMany({
            where: { id: { in: holderIds } },
            select: { id: true, safariRole: true },
        });
        const roleById = new Map(users.map((u) => [u.id, u.safariRole]));
        return {
            ...projection,
            drivers: projection.drivers.map((d) => ({
                ...d,
                holderRole: roleById.get(d.driverId) ?? null,
            })),
        };
    }
    composeFromAnalysis(analysis) {
        const flowsByDriver = new Map();
        for (const f of analysis.flows) {
            if (!f.driverId)
                continue;
            if (parseAmount(f.amount) <= 0)
                continue;
            const list = flowsByDriver.get(f.driverId) ?? [];
            list.push(f);
            flowsByDriver.set(f.driverId, list);
        }
        const financialAlerts = [];
        const complianceAlerts = [];
        for (const a of analysis.anomalies) {
            const driverFlows = a.driverId
                ? (flowsByDriver.get(a.driverId) ?? [])
                : [];
            const cashAgeHours = oldestCashAgeHours(driverFlows, a);
            const amountKd = parseAmount(a.amount);
            const projected = projectAlert({
                anomaly: a,
                cashAgeHours,
                amountKd,
                driverFlows,
            });
            if (projected.domain === 'FINANCIAL') {
                financialAlerts.push(projected);
            }
            else {
                complianceAlerts.push(projected);
            }
        }
        const driverIdsWithFinancial = new Set(financialAlerts.map((a) => a.driverId).filter((d) => !!d));
        const driverIdsWithCompliance = new Set(complianceAlerts.map((a) => a.driverId).filter((d) => !!d));
        const driverIds = new Set([
            ...flowsByDriver.keys(),
            ...driverIdsWithFinancial,
            ...driverIdsWithCompliance,
        ]);
        const drivers = [];
        for (const driverId of driverIds) {
            const flows = flowsByDriver.get(driverId) ?? [];
            const hasFinancial = driverIdsWithFinancial.has(driverId);
            const hasCompliance = driverIdsWithCompliance.has(driverId);
            const status = hasFinancial
                ? 'AT_RISK'
                : hasCompliance
                    ? 'COMPLIANCE_ONLY'
                    : 'NORMAL';
            const cashAgeHours = oldestFlowAgeHours(flows);
            const amountKd = flows.reduce((s, f) => s + parseAmount(f.amount), 0);
            const lead = flows[0];
            const shiftDurationHours = flows.find((f) => f.shiftStatus === 'OPEN')?.shiftDurationHours ?? null;
            drivers.push({
                driverId,
                driverName: lead?.driverName ?? driverNameFromAlerts(driverId, [
                    ...financialAlerts,
                    ...complianceAlerts,
                ]),
                branchId: lead?.branchId ?? null,
                holderRole: null,
                status,
                cashAgeHours,
                amount: amountKd.toFixed(4),
                shiftDurationHours,
                note: noteForDriver({
                    status,
                    shiftDurationHours,
                    cashAgeHours,
                    amountKd,
                    financialAlerts,
                    complianceAlerts,
                    driverId,
                }),
            });
        }
        const systemStatus = deriveSystemStatus(financialAlerts);
        const finalDecision = composeFinalDecision({
            systemStatus,
            financialAlerts,
            complianceAlerts,
            drivers,
        });
        return {
            systemStatus,
            financialAlerts: sortAlerts(financialAlerts),
            complianceAlerts: sortAlerts(complianceAlerts),
            drivers: drivers.sort(driverSorter),
            finalDecision,
            rules: {
                gracePeriodHours: GRACE_PERIOD_HOURS,
                smallAmountFloorKd: SMALL_AMOUNT_FLOOR_KD,
                financialChainTypes: Array.from(FINANCIAL_CHAIN_TYPES),
                complianceTypes: Array.from(COMPLIANCE_TYPES),
                shiftFinancialSeverityCap: 'WARNING',
                generatedAt: new Date().toISOString(),
            },
            readOnly: true,
            advisoryOnly: true,
        };
    }
};
exports.CashClassifierService = CashClassifierService;
exports.CashClassifierService = CashClassifierService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [cash_intelligence_v2_service_1.CashIntelligenceV2Service,
        prisma_service_1.PrismaService])
], CashClassifierService);
function projectAlert(input) {
    const a = input.anomaly;
    if (FINANCIAL_CHAIN_TYPES.has(a.type)) {
        return finalAlert({
            anomaly: a,
            domain: 'FINANCIAL',
            type: a.type,
            severity: capSeverityByAmount(normaliseSeverity(a.severity), input.amountKd),
            cashAgeHours: input.cashAgeHours,
            reason: a.reason,
            originalType: null,
        });
    }
    if (a.type === 'SHIFT_OVERDUE') {
        const isYoung = input.cashAgeHours < GRACE_PERIOD_HOURS;
        const isSmall = input.amountKd < SMALL_AMOUNT_FLOOR_KD;
        if (isYoung || isSmall || input.amountKd === 0) {
            return finalAlert({
                anomaly: a,
                domain: 'COMPLIANCE',
                type: 'SHIFT_COMPLIANCE_ONLY',
                severity: 'INFO',
                cashAgeHours: input.cashAgeHours,
                reason: a.reason +
                    ' (Reclassified COMPLIANCE: cash is fresh and/or trivial — no financial risk.)',
                originalType: 'SHIFT_OVERDUE',
            });
        }
        return finalAlert({
            anomaly: a,
            domain: 'FINANCIAL',
            type: 'SHIFT_OVERDUE_FINANCIAL',
            severity: 'WARNING',
            cashAgeHours: input.cashAgeHours,
            reason: a.reason +
                ' (Reclassified FINANCIAL: cash >= 24h and amount material; capped at WARNING.)',
            originalType: 'SHIFT_OVERDUE',
        });
    }
    if (AGING_TYPES.has(a.type)) {
        const isYoung = input.cashAgeHours < GRACE_PERIOD_HOURS;
        if (isYoung || input.amountKd < SMALL_AMOUNT_FLOOR_KD) {
            return finalAlert({
                anomaly: a,
                domain: 'COMPLIANCE',
                type: a.type,
                severity: 'INFO',
                cashAgeHours: input.cashAgeHours,
                reason: a.reason +
                    ' (Reclassified COMPLIANCE: under 24h grace or amount below 5 KD.)',
                originalType: a.type,
            });
        }
        return finalAlert({
            anomaly: a,
            domain: 'FINANCIAL',
            type: a.type,
            severity: capSeverityByAmount(normaliseSeverity(a.severity), input.amountKd),
            cashAgeHours: input.cashAgeHours,
            reason: a.reason,
            originalType: null,
        });
    }
    return finalAlert({
        anomaly: a,
        domain: 'COMPLIANCE',
        type: a.type,
        severity: 'INFO',
        cashAgeHours: input.cashAgeHours,
        reason: a.reason,
        originalType: null,
    });
}
function parseAmount(s) {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
}
function normaliseSeverity(s) {
    if (s === 'CRITICAL' || s === 'CRITICAL_ESCALATED')
        return 'CRITICAL';
    if (s === 'WARNING')
        return 'WARNING';
    return 'INFO';
}
function capSeverityByAmount(s, amountKd) {
    if (amountKd < SMALL_AMOUNT_FLOOR_KD && s === 'CRITICAL')
        return 'WARNING';
    return s;
}
function oldestCashAgeHours(flows, a) {
    if (flows.length > 0)
        return oldestFlowAgeHours(flows);
    if (a.type === 'SHIFT_OVERDUE')
        return 0;
    return Math.max(0, a.ageDays * 24);
}
function oldestFlowAgeHours(flows) {
    let max = 0;
    for (const f of flows)
        if (f.ageHours > max)
            max = f.ageHours;
    return max;
}
function deriveSystemStatus(financialAlerts) {
    let hasCritical = false;
    let hasWarning = false;
    for (const a of financialAlerts) {
        if (a.severity === 'CRITICAL')
            hasCritical = true;
        else if (a.severity === 'WARNING')
            hasWarning = true;
    }
    if (hasCritical)
        return 'RED';
    if (hasWarning)
        return 'YELLOW';
    return 'GREEN';
}
function finalAlert(input) {
    return {
        domain: input.domain,
        type: input.type,
        severity: input.severity,
        driverId: input.anomaly.driverId,
        driverName: null,
        branchId: input.anomaly.branchId,
        amount: input.anomaly.amount,
        cashAgeHours: round2(input.cashAgeHours),
        reason: input.reason,
        originalType: input.originalType,
    };
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
function noteForDriver(input) {
    if (input.status === 'AT_RISK') {
        const types = input.financialAlerts
            .filter((a) => a.driverId === input.driverId)
            .map((a) => a.type)
            .join(', ');
        return `Financial risk: ${types}.`;
    }
    if (input.status === 'COMPLIANCE_ONLY') {
        const shiftPart = input.shiftDurationHours !== null
            ? `Shift open ${input.shiftDurationHours.toFixed(1)}h.`
            : 'Operational concern.';
        return `${shiftPart} Cash on driver: ${input.amountKd.toFixed(4)} KD, age ${input.cashAgeHours.toFixed(2)}h. No financial risk.`;
    }
    if (input.amountKd === 0)
        return 'No live cash.';
    return `Cash ${input.amountKd.toFixed(4)} KD aged ${input.cashAgeHours.toFixed(2)}h within grace period — normal.`;
}
function composeFinalDecision(input) {
    const fin = input.financialAlerts.length;
    const comp = input.complianceAlerts.length;
    const atRisk = input.drivers.filter((d) => d.status === 'AT_RISK').length;
    const compOnly = input.drivers.filter((d) => d.status === 'COMPLIANCE_ONLY').length;
    if (input.systemStatus === 'GREEN' && comp === 0) {
        return 'No financial or compliance issues — system healthy.';
    }
    if (input.systemStatus === 'GREEN') {
        return `No financial risk. ${comp} operational compliance item(s) on ${compOnly} driver(s) — no dashboard escalation.`;
    }
    if (input.systemStatus === 'YELLOW') {
        return `${fin} financial warning(s) on ${atRisk} driver(s). ${comp} compliance item(s) display-only.`;
    }
    return `CRITICAL financial risk on ${atRisk} driver(s) (${fin} alert(s)). Immediate action required.`;
}
function driverSorter(a, b) {
    const order = { AT_RISK: 0, COMPLIANCE_ONLY: 1, NORMAL: 2 };
    if (order[a.status] !== order[b.status])
        return order[a.status] - order[b.status];
    return parseAmount(b.amount) - parseAmount(a.amount);
}
function sortAlerts(alerts) {
    const sevRank = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    return alerts
        .slice()
        .sort((a, b) => sevRank[a.severity] - sevRank[b.severity] ||
        parseAmount(b.amount) - parseAmount(a.amount));
}
function driverNameFromAlerts(driverId, alerts) {
    for (const a of alerts) {
        if (a.driverId === driverId && a.driverName)
            return a.driverName;
    }
    return null;
}
//# sourceMappingURL=cash-classifier.service.js.map