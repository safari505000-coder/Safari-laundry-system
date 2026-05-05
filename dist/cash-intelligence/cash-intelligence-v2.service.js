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
exports.CashIntelligenceV2Service = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const kuwait_time_1 = require("../common/time/kuwait-time");
const money_util_1 = require("./engines/money.util");
const stage_classifier_1 = require("./engines/stage.classifier");
const aging_engine_1 = require("./engines/aging.engine");
const SHIFT_OVERDUE_HOURS = 16;
const TOLERANCE_MINOR = 100n;
const SMALL_THRESHOLD_MINOR = 20n * 10000n;
const LARGE_THRESHOLD_MINOR = 200n * 10000n;
let CashIntelligenceV2Service = class CashIntelligenceV2Service {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async runAnalysis(query = {}) {
        const generatedAt = new Date();
        const reportDayIso = query.date ?? (0, kuwait_time_1.kuwaitDayIso)(generatedAt);
        const todayStart = kuwaitMidnightUtcFromIso(reportDayIso);
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
        const dataFetched = [];
        const logicApplied = [];
        const ignoredCases = [];
        const assumptions = [];
        const orderWhere = {
            status: client_1.OrderStatus.COMPLETED,
            posPaymentMethod: client_1.PosPaymentMethod.CASH,
            OR: [
                { completedAt: { gte: todayStart, lt: todayEnd } },
                {
                    cashStatus: {
                        in: [client_1.CashStatus.PAID_TO_DRIVER, client_1.CashStatus.HANDED_OVER_TO_OFFICE],
                    },
                },
            ],
        };
        if (query.branchId) {
            orderWhere.driver = { branchId: query.branchId };
        }
        const orders = await this.prisma.order.findMany({
            where: orderWhere,
            select: {
                id: true,
                totalPrice: true,
                cashStatus: true,
                completedAt: true,
                posPaymentMethod: true,
                subscriptionId: true,
                driverId: true,
                handoverShiftId: true,
                driver: {
                    select: {
                        id: true,
                        fullName: true,
                        username: true,
                        branchId: true,
                    },
                },
            },
        });
        dataFetched.push(`orders: ${orders.length} CASH orders (today OR still in flight: PAID_TO_DRIVER / HANDED_OVER_TO_OFFICE)`);
        const handoverShiftIds = new Set();
        const driverIds = new Set();
        for (const o of orders) {
            if (o.handoverShiftId)
                handoverShiftIds.add(o.handoverShiftId);
            if (o.driverId)
                driverIds.add(o.driverId);
        }
        const handoverShifts = handoverShiftIds.size > 0
            ? await this.prisma.shift.findMany({
                where: { id: { in: [...handoverShiftIds] } },
                select: {
                    id: true,
                    status: true,
                    driverId: true,
                    startedAt: true,
                    endedAt: true,
                },
            })
            : [];
        dataFetched.push(`handoverShifts: ${handoverShifts.length}`);
        const custodies = handoverShiftIds.size > 0
            ? await this.prisma.managerCashCustody.findMany({
                where: { shiftId: { in: [...handoverShiftIds] } },
                select: {
                    id: true,
                    status: true,
                    shiftId: true,
                    driverId: true,
                    branchId: true,
                    amountKd: true,
                    receivedFromDriverAt: true,
                    slipUploadedAt: true,
                    depositSlipUrl: true,
                    verifiedAt: true,
                    bankDepositLog: {
                        select: {
                            id: true,
                            status: true,
                            amountKd: true,
                            verifiedAt: true,
                        },
                    },
                },
            })
            : [];
        dataFetched.push(`managerCashCustody: ${custodies.length}`);
        const openShifts = await this.prisma.shift.findMany({
            where: {
                status: client_1.ShiftStatus.OPEN,
                ...(query.branchId
                    ? { driver: { branchId: query.branchId } }
                    : {}),
            },
            select: {
                id: true,
                driverId: true,
                startedAt: true,
                driver: {
                    select: { id: true, fullName: true, username: true, branchId: true },
                },
            },
        });
        dataFetched.push(`openShifts: ${openShifts.length}`);
        const driverDeposits = driverIds.size > 0
            ? await this.prisma.deposit.findMany({
                where: {
                    driverId: { in: [...driverIds] },
                    createdAt: {
                        gte: new Date(todayStart.getTime() - 14 * 24 * 60 * 60 * 1000),
                    },
                },
                select: { id: true, driverId: true, status: true, createdAt: true },
            })
            : [];
        dataFetched.push(`legacyDriverDeposits: ${driverDeposits.length}`);
        logicApplied.push('STEP 3: Built flow map by joining order → shift → custody → deposit.');
        const shiftById = new Map();
        for (const s of handoverShifts)
            shiftById.set(s.id, s);
        const custodyByShiftId = new Map();
        for (const c of custodies) {
            if (c.shiftId)
                custodyByShiftId.set(c.shiftId, c);
        }
        const driverHasOpenShiftNow = new Map();
        const driverOpenShiftStartedAt = new Map();
        for (const s of openShifts) {
            driverHasOpenShiftNow.set(s.driverId, true);
            const prev = driverOpenShiftStartedAt.get(s.driverId);
            if (!prev || s.startedAt < prev) {
                driverOpenShiftStartedAt.set(s.driverId, s.startedAt);
            }
        }
        const branchHadActivityToday = new Map();
        for (const o of orders) {
            if (o.completedAt &&
                o.completedAt >= todayStart &&
                o.completedAt < todayEnd &&
                o.driver?.branchId) {
                branchHadActivityToday.set(o.driver.branchId, true);
            }
        }
        const driverAgg = new Map();
        const ensureAgg = (id) => {
            let agg = driverAgg.get(id);
            if (!agg) {
                agg = {
                    ordersTodayCount: 0,
                    collectedCashTodayMinor: 0n,
                    remainingCashMinor: 0n,
                    lastCashActivityAt: null,
                };
                driverAgg.set(id, agg);
            }
            return agg;
        };
        for (const o of orders) {
            if (!o.driverId || !o.completedAt)
                continue;
            const agg = ensureAgg(o.driverId);
            const amount = (0, money_util_1.fixed4ToMinor)(o.totalPrice);
            const isToday = o.completedAt >= todayStart && o.completedAt < todayEnd;
            if (isToday) {
                agg.ordersTodayCount += 1;
                agg.collectedCashTodayMinor += amount;
            }
            if (o.cashStatus === client_1.CashStatus.PAID_TO_DRIVER ||
                (o.cashStatus === client_1.CashStatus.HANDED_OVER_TO_OFFICE && !o.handoverShiftId)) {
                agg.remainingCashMinor += amount;
            }
            if (!agg.lastCashActivityAt ||
                o.completedAt > agg.lastCashActivityAt) {
                agg.lastCashActivityAt = o.completedAt;
            }
        }
        logicApplied.push('STEP 1: Validation gate per driver — NO_ACTIVITY_TODAY / HISTORICAL_BALANCE / ACTIVE_FLOW.');
        logicApplied.push(`STEP 1 OVERRIDE (R01): SHIFT_OVERDUE for any OPEN shift older than ${SHIFT_OVERDUE_HOURS}h.`);
        const flows = [];
        for (const o of orders) {
            if (!o.completedAt)
                continue;
            const shift = o.handoverShiftId ? shiftById.get(o.handoverShiftId) : null;
            const custody = o.handoverShiftId
                ? custodyByShiftId.get(o.handoverShiftId)
                : null;
            const bankDeposit = custody?.bankDepositLog ?? null;
            const stage = (0, stage_classifier_1.classifyStage)({
                handoverShiftId: o.handoverShiftId ?? null,
                handoverShiftStatus: shift?.status ?? null,
                custodyId: custody?.id ?? null,
                custodyStatus: custody?.status ?? null,
                bankDepositId: bankDeposit?.id ?? null,
                bankDepositStatus: bankDeposit?.status ?? null,
            });
            const amountMinor = (0, money_util_1.fixed4ToMinor)(o.totalPrice);
            const amountTier = classifyAmountTier(amountMinor);
            const originDate = (0, kuwait_time_1.kuwaitDayIso)(o.completedAt);
            const ageDays = (0, aging_engine_1.kuwaitCalendarDiff)(originDate, reportDayIso);
            const driverHasOpen = o.driverId
                ? driverHasOpenShiftNow.get(o.driverId) === true
                : false;
            const openStartedAt = o.driverId
                ? driverOpenShiftStartedAt.get(o.driverId) ?? null
                : null;
            const openDurationH = openStartedAt
                ? (generatedAt.getTime() - openStartedAt.getTime()) / 3_600_000
                : null;
            const agg = o.driverId ? driverAgg.get(o.driverId) : undefined;
            const collectedToday = agg ? agg.collectedCashTodayMinor : 0n;
            const ordersToday = agg ? agg.ordersTodayCount : 0;
            const remaining = agg ? agg.remainingCashMinor : 0n;
            let driverGate;
            if (driverHasOpen && openDurationH !== null && openDurationH > SHIFT_OVERDUE_HOURS) {
                driverGate = 'SHIFT_OVERDUE';
            }
            else if (ordersToday > 0 || collectedToday > 0n) {
                driverGate = 'ACTIVE_FLOW';
            }
            else if (remaining > 0n && ageDays >= 1) {
                driverGate = 'HISTORICAL_BALANCE';
            }
            else {
                driverGate = 'NO_ACTIVITY_TODAY';
            }
            const branchActive = o.driver?.branchId
                ? branchHadActivityToday.get(o.driver.branchId) === true
                : false;
            let ignored = true;
            let reason = 'unknown';
            if (ageDays === 0) {
                reason = 'NEW_CASH_SAME_DAY';
            }
            else if (driverGate === 'SHIFT_OVERDUE') {
                ignored = false;
                reason = 'SHIFT_OVERDUE_OVERRIDE_ACTIVE';
            }
            else if (driverHasOpen) {
                reason = 'ACTIVE_OPEN_SHIFT (within shift cap)';
            }
            else if (driverGate === 'NO_ACTIVITY_TODAY' && ageDays === 0) {
                reason = 'NO_ACTIVITY_TODAY';
            }
            else if (driverGate === 'HISTORICAL_BALANCE') {
                reason = 'HISTORICAL_BALANCE';
            }
            else if (ageDays >= 2 &&
                (stage === 'VERIFIED' || stage === 'DEPOSIT' || stage === 'BANK')) {
                reason = 'PIPELINE_TIMING_NOT_RISK';
            }
            else if (!branchActive && o.driver?.branchId) {
                reason = 'NO_ACTIVITY_TODAY (branch idle)';
            }
            else if (driverGate === 'ACTIVE_FLOW' && ageDays >= 1) {
                ignored = false;
                reason = 'ACTIVE_FLOW_AGED';
            }
            else {
                reason = 'NO_OPERATIONAL_RISK';
            }
            flows.push({
                orderId: o.id,
                driverId: o.driverId ?? null,
                driverName: o.driver?.fullName ?? o.driver?.username ?? null,
                branchId: o.driver?.branchId ?? null,
                amountMinor,
                amountTier,
                originDate,
                originAt: o.completedAt,
                ageDays,
                stage,
                driverGate,
                shiftStatus: driverHasOpen
                    ? 'OPEN'
                    : openStartedAt === null && !shift
                        ? 'NO_SHIFT'
                        : 'CLOSED',
                shiftDurationHours: openDurationH !== null ? Math.round(openDurationH * 100) / 100 : null,
                ignoredNonOperational: ignored,
                contextReason: reason,
                custodyId: custody?.id ?? null,
                shiftId: o.handoverShiftId ?? null,
                bankDepositId: bankDeposit?.id ?? null,
            });
        }
        for (const f of flows) {
            if (f.ignoredNonOperational) {
                ignoredCases.push(`order:${f.orderId} (${f.amountTier} ${(0, money_util_1.minorToFixed4)(f.amountMinor)} KD) → ${f.contextReason}`);
            }
        }
        logicApplied.push('STEP 7: Anomaly detection over ACTIVE_FLOW only (with SHIFT_OVERDUE override).');
        logicApplied.push(`STEP 4 (R03): tolerance band = ${(0, money_util_1.minorToFixed4)(TOLERANCE_MINOR)} KD applied to amount comparisons.`);
        const orderById = new Map();
        for (const o of orders)
            orderById.set(o.id, o);
        const driversWithApprovedDeposit = new Set(driverDeposits.filter((d) => d.status === 'APPROVED').map((d) => d.driverId));
        const anomalies = [];
        for (const s of openShifts) {
            const ageH = (generatedAt.getTime() - s.startedAt.getTime()) / 3_600_000;
            if (ageH <= SHIFT_OVERDUE_HOURS)
                continue;
            const collectedToday = driverAgg.get(s.driverId)?.collectedCashTodayMinor ?? 0n;
            const remaining = driverAgg.get(s.driverId)?.remainingCashMinor ?? 0n;
            const exposureMinor = collectedToday + remaining;
            const tier = classifyAmountTier(exposureMinor);
            const ageDays = Math.floor(ageH / 24);
            const sev = severityFor(tier, ageDays);
            anomalies.push({
                type: 'SHIFT_OVERDUE',
                severity: sev,
                amount: (0, money_util_1.minorToFixed4)(exposureMinor),
                amountTier: tier,
                ageDays,
                stage: 'DRIVER',
                responsible: 'DRIVER',
                driverId: s.driverId,
                branchId: s.driver?.branchId ?? null,
                reason: `Shift open for ${ageH.toFixed(1)}h (cap=${SHIFT_OVERDUE_HOURS}h). Exposure on driver: ${(0, money_util_1.minorToFixed4)(exposureMinor)} KD.`,
                actionLocked: ageDays < 2,
                requiresManualReview: true,
            });
        }
        for (const f of flows) {
            if (f.ignoredNonOperational)
                continue;
            if (f.stage === 'BANK')
                continue;
            const flowAgeHours = (generatedAt.getTime() - f.originAt.getTime()) / 3_600_000;
            if (flowAgeHours < 24 && f.driverGate !== 'SHIFT_OVERDUE')
                continue;
            const order = orderById.get(f.orderId);
            const custody = f.custodyId
                ? custodies.find((c) => c.id === f.custodyId)
                : null;
            if (f.stage === 'DRIVER') {
                anomalies.push(asAnomaly(f, 'STUCK_AT_DRIVER', 'DRIVER', `Cash from ${f.originDate} still on driver ${f.driverName ?? f.driverId} after ${f.ageDays} day(s) with shift CLOSED.`));
            }
            else if (f.stage === 'DRIVER_HANDOVER') {
                anomalies.push(asAnomaly(f, 'HANDOVER_DELAY', 'BRANCH_MANAGER', 'Handover shift CLOSED but no manager custody bag exists.'));
            }
            else if (f.stage === 'CUSTODY' && custody) {
                if (custody.status === client_1.ManagerCashCustodyStatus.PENDING_DEPOSIT) {
                    anomalies.push(asAnomaly(f, 'CUSTODY_DELAY', 'BRANCH_MANAGER', 'Manager custody bag PENDING_DEPOSIT; deposit slip not uploaded.'));
                }
            }
            else if (f.stage === 'VERIFIED' && custody) {
                if (!custody.bankDepositLog) {
                    anomalies.push(asAnomaly(f, 'DEPOSIT_NOT_REGISTERED', 'SYSTEM', 'Custody marked VERIFIED but no BankDepositLog row links it.'));
                }
            }
            if (custody?.bankDepositLog) {
                const cMinor = (0, money_util_1.fixed4ToMinor)(custody.amountKd);
                const dMinor = (0, money_util_1.fixed4ToMinor)(custody.bankDepositLog.amountKd);
                const delta = dMinor - cMinor;
                if ((0, money_util_1.absMinor)(delta) > TOLERANCE_MINOR) {
                    if (delta < 0n) {
                        anomalies.push(asAnomaly(f, 'DEPOSIT_AMOUNT_MISMATCH', 'ACCOUNTANT', `Bank deposit short by ${(0, money_util_1.minorToFixed4)(-delta)} KD vs custody (tolerance ${(0, money_util_1.minorToFixed4)(TOLERANCE_MINOR)} KD).`));
                    }
                    else {
                        anomalies.push(asAnomaly(f, 'OVERPAYMENT_ANOMALY', 'ACCOUNTANT', `Bank deposit exceeds custody by ${(0, money_util_1.minorToFixed4)(delta)} KD.`));
                    }
                }
            }
            if (order?.subscriptionId &&
                order.posPaymentMethod === client_1.PosPaymentMethod.CASH) {
                anomalies.push(asAnomaly(f, 'SUBSCRIPTION_LEAKAGE', 'SYSTEM', 'Order is tied to an active subscription but was settled in CASH; verify wallet was depleted.'));
            }
            if (order &&
                order.driverId &&
                f.stage !== 'DRIVER' &&
                driversWithApprovedDeposit.has(order.driverId)) {
                const overlap = driverDeposits.some((d) => d.driverId === order.driverId &&
                    d.status === 'APPROVED' &&
                    order.completedAt &&
                    Math.abs(d.createdAt.getTime() - order.completedAt.getTime()) <=
                        48 * 3_600_000);
                if (overlap) {
                    anomalies.push(asAnomaly(f, 'DOUBLE_COUNT_RISK', 'SYSTEM', 'Order chain includes a manager custody bag AND an APPROVED legacy driver Deposit row within ±48h.'));
                }
            }
        }
        logicApplied.push('STEP 6 (R02): severity = f(ageDays, amountTier). INFO/WARNING/CRITICAL/ESCALATED.');
        logicApplied.push('STEP 9 (R05): every anomaly carries actionLocked + requiresManualReview.');
        const liveFlows = flows.filter((f) => f.stage !== 'BANK');
        const totalCashMinor = liveFlows.reduce((s, f) => s + f.amountMinor, 0n);
        const newCashMinor = liveFlows
            .filter((f) => f.ageDays === 0)
            .reduce((s, f) => s + f.amountMinor, 0n);
        const agedCashMinor = totalCashMinor - newCashMinor;
        const locDriver = liveFlows
            .filter((f) => f.stage === 'DRIVER' || f.stage === 'DRIVER_HANDOVER')
            .reduce((s, f) => s + f.amountMinor, 0n);
        const locCustody = liveFlows
            .filter((f) => f.stage === 'CUSTODY' || f.stage === 'VERIFIED')
            .reduce((s, f) => s + f.amountMinor, 0n);
        const locBank = liveFlows
            .filter((f) => f.stage === 'DEPOSIT')
            .reduce((s, f) => s + f.amountMinor, 0n);
        assumptions.push('Safari-ERP has no standalone Payment table; payment events are read from Order.cashStatus + Order.posPaymentMethod plus the legacy Deposit table.');
        assumptions.push(`SHIFT_OVERDUE cap = ${SHIFT_OVERDUE_HOURS}h (R01). Tolerance band = ${(0, money_util_1.minorToFixed4)(TOLERANCE_MINOR)} KD (R03). Tier thresholds: SMALL<20, MEDIUM<200, LARGE>=200 (R02).`);
        assumptions.push(`Reporting day anchor = Asia/Kuwait calendar day ${reportDayIso}.`);
        const systemHealth = anomalies.some((a) => a.severity === 'CRITICAL' || a.severity === 'CRITICAL_ESCALATED')
            ? 'CRITICAL'
            : anomalies.some((a) => a.severity === 'WARNING')
                ? 'WARNING'
                : 'OK';
        const finalAssessment = composeAssessment(systemHealth, anomalies, flows, ignoredCases.length);
        return {
            executionSummary: {
                dataFetched,
                logicApplied,
                ignoredCases,
                assumptions,
                toleranceKd: (0, money_util_1.minorToFixed4)(TOLERANCE_MINOR),
                shiftOverdueCapHours: SHIFT_OVERDUE_HOURS,
                asOfDate: reportDayIso,
                generatedAt: generatedAt.toISOString(),
            },
            systemHealth,
            summary: {
                totalCash: (0, money_util_1.minorToFixed4)(totalCashMinor),
                newCash: (0, money_util_1.minorToFixed4)(newCashMinor),
                agedCash: (0, money_util_1.minorToFixed4)(agedCashMinor),
                issues: anomalies.length,
            },
            locationSummary: {
                DRIVER: (0, money_util_1.minorToFixed4)(locDriver),
                CUSTODY: (0, money_util_1.minorToFixed4)(locCustody),
                BANK: (0, money_util_1.minorToFixed4)(locBank),
            },
            flows: liveFlows.map((f) => toPublicFlow(f, generatedAt)),
            anomalies,
            finalAssessment,
            readOnly: true,
            advisoryOnly: true,
        };
    }
};
exports.CashIntelligenceV2Service = CashIntelligenceV2Service;
exports.CashIntelligenceV2Service = CashIntelligenceV2Service = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CashIntelligenceV2Service);
function classifyAmountTier(minor) {
    if (minor < SMALL_THRESHOLD_MINOR)
        return 'SMALL';
    if (minor <= LARGE_THRESHOLD_MINOR)
        return 'MEDIUM';
    return 'LARGE';
}
function severityFor(tier, ageDays) {
    if (ageDays >= 2) {
        if (tier === 'LARGE')
            return 'CRITICAL_ESCALATED';
        if (tier === 'MEDIUM')
            return 'CRITICAL';
        return 'WARNING';
    }
    if (ageDays === 1) {
        if (tier === 'LARGE')
            return 'CRITICAL';
        if (tier === 'MEDIUM')
            return 'WARNING';
        return 'INFO';
    }
    if (tier === 'LARGE')
        return 'WARNING';
    return 'INFO';
}
function asAnomaly(f, type, responsible, reason) {
    const severity = severityFor(f.amountTier, f.ageDays);
    return {
        type,
        severity,
        amount: (0, money_util_1.minorToFixed4)(f.amountMinor),
        amountTier: f.amountTier,
        ageDays: f.ageDays,
        stage: f.stage,
        responsible,
        driverId: f.driverId,
        branchId: f.branchId,
        reason,
        actionLocked: f.ageDays < 2,
        requiresManualReview: true,
    };
}
function toPublicFlow(f, generatedAt) {
    const rawHours = (generatedAt.getTime() - f.originAt.getTime()) / 3_600_000;
    const ageHours = Math.max(0, Math.round(rawHours * 100) / 100);
    return {
        driverId: f.driverId ?? '',
        driverName: f.driverName,
        branchId: f.branchId,
        amount: (0, money_util_1.minorToFixed4)(f.amountMinor),
        amountTier: f.amountTier,
        originDate: f.originDate,
        ageDays: f.ageDays,
        ageHours,
        stage: f.stage,
        driverGate: f.driverGate,
        shiftStatus: f.shiftStatus,
        shiftDurationHours: f.shiftDurationHours,
        ignoredNonOperational: f.ignoredNonOperational,
        contextReason: f.contextReason,
    };
}
function composeAssessment(health, anomalies, flows, suppressedCount) {
    const live = flows.filter((f) => !f.ignoredNonOperational).length;
    if (anomalies.length === 0) {
        return `Health=${health}. ${live} active flow(s); ${suppressedCount} record(s) suppressed by the validation gate (NEW_CASH / OPEN_SHIFT / HISTORICAL_BALANCE / NO_ACTIVITY). No anomalies meet the strict v2 thresholds.`;
    }
    const escalated = anomalies.filter((a) => a.severity === 'CRITICAL_ESCALATED').length;
    const critical = anomalies.filter((a) => a.severity === 'CRITICAL').length;
    const warning = anomalies.filter((a) => a.severity === 'WARNING').length;
    const info = anomalies.filter((a) => a.severity === 'INFO').length;
    return `Health=${health}. Anomalies: ${escalated} ESCALATED, ${critical} CRITICAL, ${warning} WARNING, ${info} INFO. ${suppressedCount} record(s) suppressed by gate. ADVISORY ONLY — actionLocked=true on age<2 days; manual review required for any HR/payroll action (R05).`;
}
function kuwaitMidnightUtcFromIso(dayIso) {
    const [y, m, d] = dayIso.split('-').map(Number);
    const KUWAIT_OFFSET_MIN = 180;
    return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0) -
        KUWAIT_OFFSET_MIN * 60_000);
}
//# sourceMappingURL=cash-intelligence-v2.service.js.map