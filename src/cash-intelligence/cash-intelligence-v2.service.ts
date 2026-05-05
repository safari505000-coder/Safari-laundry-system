/**
 * Cash Intelligence v2 — STRICT READ-ONLY analyser with
 * built-in self-explanation and anti-false-positive armour.
 *
 * v2 deltas vs v1 (incorporates audit fixes R01..R05):
 *
 *   R01  SHIFT_OVERDUE override
 *        → an OPEN shift > 16h is no longer protected; the
 *          driver becomes ACTIVE risk for SHIFT_OVERDUE only.
 *
 *   R02  Amount-aware severity
 *        → severity = f(ageDays, amountTier) instead of f(ageDays).
 *
 *   R03  Tolerance band 0.010 KD
 *        → DEPOSIT_AMOUNT_MISMATCH and OVERPAYMENT_ANOMALY only fire
 *          when |delta| > 100 fils.
 *
 *   R04  Stricter anomaly definitions
 *        → DEPOSIT_NOT_REGISTERED only when custody.status=VERIFIED
 *          AND BankDepositLog row missing.
 *        → DOUBLE_COUNT_RISK only when same orderId is in custody
 *          chain AND a confirmed legacy Deposit row exists for the
 *          same driver within ±48h.
 *        → SUBSCRIPTION_LEAKAGE only when subscriptionId is present
 *          AND posPaymentMethod=CASH AND no wallet settlement event
 *          (best-effort: subscription+cash combo, surfaced for review).
 *
 *   R05  Decision lock
 *        → every anomaly carries actionLocked + requiresManualReview;
 *          downstream payroll/HR must read these before any action.
 *
 * READ-ONLY CONTRACT: only findMany / findUnique / findFirst Prisma
 * methods. No transactions, no mutations, no executeRaw.
 */
import { Injectable } from '@nestjs/common';
import {
  BankDepositStatus,
  CashStatus,
  ManagerCashCustodyStatus,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
  ShiftStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { kuwaitDayIso } from '../common/time/kuwait-time';
import {
  CashIntelligenceAnalysisDto,
  CashV2AmountTier,
  CashV2AnomalyDto,
  CashV2AnomalyType,
  CashV2DriverGate,
  CashV2FlowDto,
  CashV2Health,
  CashV2Responsible,
  CashV2Severity,
  CashV2Stage,
} from './dto/cash-intelligence-analysis.dto';
import { absMinor, fixed4ToMinor, minorToFixed4 } from './engines/money.util';
import { classifyStage } from './engines/stage.classifier';
import { kuwaitCalendarDiff } from './engines/aging.engine';

// ─── Tunables (R01..R03) ────────────────────────────────────────────
const SHIFT_OVERDUE_HOURS = 16;
const TOLERANCE_MINOR = 100n; // 0.0100 KD
const SMALL_THRESHOLD_MINOR = 20n * 10_000n; // 20 KD
const LARGE_THRESHOLD_MINOR = 200n * 10_000n; // 200 KD

export interface CashV2Query {
  date?: string;
  branchId?: string;
}

@Injectable()
export class CashIntelligenceV2Service {
  constructor(private readonly prisma: PrismaService) {}

  async runAnalysis(query: CashV2Query = {}): Promise<CashIntelligenceAnalysisDto> {
    const generatedAt = new Date();
    const reportDayIso = query.date ?? kuwaitDayIso(generatedAt);
    const todayStart = kuwaitMidnightUtcFromIso(reportDayIso);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    // Trail of every meaningful execution decision — fed into the
    // executionSummary at the end so the auditor can replay the run.
    const dataFetched: string[] = [];
    const logicApplied: string[] = [];
    const ignoredCases: string[] = [];
    const assumptions: string[] = [];

    // ─── Step 2: fetch evidence ───────────────────────────────────
    const orderWhere: Prisma.OrderWhereInput = {
      status: OrderStatus.COMPLETED,
      posPaymentMethod: PosPaymentMethod.CASH,
      OR: [
        { completedAt: { gte: todayStart, lt: todayEnd } },
        {
          cashStatus: {
            in: [CashStatus.PAID_TO_DRIVER, CashStatus.HANDED_OVER_TO_OFFICE],
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
    dataFetched.push(
      `orders: ${orders.length} CASH orders (today OR still in flight: PAID_TO_DRIVER / HANDED_OVER_TO_OFFICE)`,
    );

    const handoverShiftIds = new Set<string>();
    const driverIds = new Set<string>();
    for (const o of orders) {
      if (o.handoverShiftId) handoverShiftIds.add(o.handoverShiftId);
      if (o.driverId) driverIds.add(o.driverId);
    }

    const handoverShifts =
      handoverShiftIds.size > 0
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

    const custodies =
      handoverShiftIds.size > 0
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

    // R01 — open shifts (any duration) for the involved drivers,
    // PLUS any open shifts globally (so SHIFT_OVERDUE catches drivers
    // who had no orders today but a shift left ajar).
    const openShifts = await this.prisma.shift.findMany({
      where: {
        status: ShiftStatus.OPEN,
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

    // Legacy driver Deposit rows for the last 14 days — DOUBLE_COUNT_RISK only.
    const driverDeposits =
      driverIds.size > 0
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

    // ─── Step 3: build flow map ───────────────────────────────────
    logicApplied.push('STEP 3: Built flow map by joining order → shift → custody → deposit.');

    const shiftById = new Map<string, (typeof handoverShifts)[number]>();
    for (const s of handoverShifts) shiftById.set(s.id, s);

    const custodyByShiftId = new Map<string, (typeof custodies)[number]>();
    for (const c of custodies) {
      if (c.shiftId) custodyByShiftId.set(c.shiftId, c);
    }

    const driverHasOpenShiftNow = new Map<string, boolean>();
    const driverOpenShiftStartedAt = new Map<string, Date>();
    for (const s of openShifts) {
      driverHasOpenShiftNow.set(s.driverId, true);
      // Keep the EARLIEST open shift per driver — that's the one whose
      // duration matters for SHIFT_OVERDUE.
      const prev = driverOpenShiftStartedAt.get(s.driverId);
      if (!prev || s.startedAt < prev) {
        driverOpenShiftStartedAt.set(s.driverId, s.startedAt);
      }
    }

    // Branch-level: did this branch see any cash today?
    const branchHadActivityToday = new Map<string, boolean>();
    for (const o of orders) {
      if (
        o.completedAt &&
        o.completedAt >= todayStart &&
        o.completedAt < todayEnd &&
        o.driver?.branchId
      ) {
        branchHadActivityToday.set(o.driver.branchId, true);
      }
    }

    // Per-driver gate aggregates (Step 1).
    type DriverAgg = {
      ordersTodayCount: number;
      collectedCashTodayMinor: bigint;
      remainingCashMinor: bigint;
      lastCashActivityAt: Date | null;
    };
    const driverAgg = new Map<string, DriverAgg>();
    const ensureAgg = (id: string): DriverAgg => {
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
      if (!o.driverId || !o.completedAt) continue;
      const agg = ensureAgg(o.driverId);
      const amount = fixed4ToMinor(o.totalPrice);
      const isToday =
        o.completedAt >= todayStart && o.completedAt < todayEnd;
      if (isToday) {
        agg.ordersTodayCount += 1;
        agg.collectedCashTodayMinor += amount;
      }
      if (
        o.cashStatus === CashStatus.PAID_TO_DRIVER ||
        (o.cashStatus === CashStatus.HANDED_OVER_TO_OFFICE && !o.handoverShiftId)
      ) {
        agg.remainingCashMinor += amount;
      }
      if (
        !agg.lastCashActivityAt ||
        o.completedAt > agg.lastCashActivityAt
      ) {
        agg.lastCashActivityAt = o.completedAt;
      }
    }

    // ─── Step 1 + R01: validation gate per flow record ────────────
    logicApplied.push(
      'STEP 1: Validation gate per driver — NO_ACTIVITY_TODAY / HISTORICAL_BALANCE / ACTIVE_FLOW.',
    );
    logicApplied.push(
      `STEP 1 OVERRIDE (R01): SHIFT_OVERDUE for any OPEN shift older than ${SHIFT_OVERDUE_HOURS}h.`,
    );

    type InternalFlow = {
      orderId: string;
      driverId: string | null;
      driverName: string | null;
      branchId: string | null;
      amountMinor: bigint;
      amountTier: CashV2AmountTier;
      originDate: string;
      originAt: Date;
      ageDays: number;
      stage: CashV2Stage;
      driverGate: CashV2DriverGate;
      shiftStatus: 'OPEN' | 'CLOSED' | 'NO_SHIFT';
      shiftDurationHours: number | null;
      ignoredNonOperational: boolean;
      contextReason: string;
      custodyId: string | null;
      shiftId: string | null;
      bankDepositId: string | null;
    };
    const flows: InternalFlow[] = [];

    for (const o of orders) {
      if (!o.completedAt) continue;
      const shift = o.handoverShiftId ? shiftById.get(o.handoverShiftId) : null;
      const custody = o.handoverShiftId
        ? custodyByShiftId.get(o.handoverShiftId)
        : null;
      const bankDeposit = custody?.bankDepositLog ?? null;

      const stage: CashV2Stage = classifyStage({
        handoverShiftId: o.handoverShiftId ?? null,
        handoverShiftStatus: shift?.status ?? null,
        custodyId: custody?.id ?? null,
        custodyStatus: custody?.status ?? null,
        bankDepositId: bankDeposit?.id ?? null,
        bankDepositStatus: bankDeposit?.status ?? null,
      });

      const amountMinor = fixed4ToMinor(o.totalPrice);
      const amountTier = classifyAmountTier(amountMinor);
      const originDate = kuwaitDayIso(o.completedAt);
      const ageDays = kuwaitCalendarDiff(originDate, reportDayIso);

      // Resolve current driver-shift signal.
      const driverHasOpen = o.driverId
        ? driverHasOpenShiftNow.get(o.driverId) === true
        : false;
      const openStartedAt = o.driverId
        ? driverOpenShiftStartedAt.get(o.driverId) ?? null
        : null;
      const openDurationH = openStartedAt
        ? (generatedAt.getTime() - openStartedAt.getTime()) / 3_600_000
        : null;

      // Step 1 driver gate
      const agg = o.driverId ? driverAgg.get(o.driverId) : undefined;
      const collectedToday = agg ? agg.collectedCashTodayMinor : 0n;
      const ordersToday = agg ? agg.ordersTodayCount : 0;
      const remaining = agg ? agg.remainingCashMinor : 0n;

      let driverGate: CashV2DriverGate;
      if (driverHasOpen && openDurationH !== null && openDurationH > SHIFT_OVERDUE_HOURS) {
        driverGate = 'SHIFT_OVERDUE';
      } else if (ordersToday > 0 || collectedToday > 0n) {
        driverGate = 'ACTIVE_FLOW';
      } else if (remaining > 0n && ageDays >= 1) {
        driverGate = 'HISTORICAL_BALANCE';
      } else {
        driverGate = 'NO_ACTIVITY_TODAY';
      }

      // Suppression: ageDays=0 always suppresses (NEW_CASH);
      // OPEN shift suppresses unless SHIFT_OVERDUE override fires;
      // NO_ACTIVITY + HISTORICAL_BALANCE both suppress (per FINAL RULE);
      // VERIFIED/DEPOSIT/BANK with age >= 2 = pipeline timing, not risk.
      const branchActive = o.driver?.branchId
        ? branchHadActivityToday.get(o.driver.branchId) === true
        : false;

      let ignored = true;
      let reason = 'unknown';

      if (ageDays === 0) {
        reason = 'NEW_CASH_SAME_DAY';
      } else if (driverGate === 'SHIFT_OVERDUE') {
        ignored = false;
        reason = 'SHIFT_OVERDUE_OVERRIDE_ACTIVE';
      } else if (driverHasOpen) {
        reason = 'ACTIVE_OPEN_SHIFT (within shift cap)';
      } else if (driverGate === 'NO_ACTIVITY_TODAY' && ageDays === 0) {
        reason = 'NO_ACTIVITY_TODAY';
      } else if (driverGate === 'HISTORICAL_BALANCE') {
        reason = 'HISTORICAL_BALANCE';
      } else if (
        ageDays >= 2 &&
        (stage === 'VERIFIED' || stage === 'DEPOSIT' || stage === 'BANK')
      ) {
        reason = 'PIPELINE_TIMING_NOT_RISK';
      } else if (!branchActive && o.driver?.branchId) {
        reason = 'NO_ACTIVITY_TODAY (branch idle)';
      } else if (driverGate === 'ACTIVE_FLOW' && ageDays >= 1) {
        ignored = false;
        reason = 'ACTIVE_FLOW_AGED';
      } else {
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
        shiftDurationHours:
          openDurationH !== null ? Math.round(openDurationH * 100) / 100 : null,
        ignoredNonOperational: ignored,
        contextReason: reason,
        custodyId: custody?.id ?? null,
        shiftId: o.handoverShiftId ?? null,
        bankDepositId: bankDeposit?.id ?? null,
      });
    }

    // Track suppressions for the executionSummary.
    for (const f of flows) {
      if (f.ignoredNonOperational) {
        ignoredCases.push(
          `order:${f.orderId} (${f.amountTier} ${minorToFixed4(f.amountMinor)} KD) → ${f.contextReason}`,
        );
      }
    }

    // ─── Step 7 R04: anomaly detection (active flows + SHIFT_OVERDUE) ─
    logicApplied.push(
      'STEP 7: Anomaly detection over ACTIVE_FLOW only (with SHIFT_OVERDUE override).',
    );
    logicApplied.push(
      `STEP 4 (R03): tolerance band = ${minorToFixed4(TOLERANCE_MINOR)} KD applied to amount comparisons.`,
    );

    const orderById = new Map<string, (typeof orders)[number]>();
    for (const o of orders) orderById.set(o.id, o);

    const driversWithApprovedDeposit = new Set<string>(
      driverDeposits.filter((d) => d.status === 'APPROVED').map((d) => d.driverId),
    );

    const anomalies: CashV2AnomalyDto[] = [];

    // R01 — emit one SHIFT_OVERDUE per overdue driver, BEFORE the
    // per-flow anomaly pass, so the alert is independent of whether
    // the driver has cash records loaded today.
    for (const s of openShifts) {
      const ageH = (generatedAt.getTime() - s.startedAt.getTime()) / 3_600_000;
      if (ageH <= SHIFT_OVERDUE_HOURS) continue;
      const collectedToday = driverAgg.get(s.driverId)?.collectedCashTodayMinor ?? 0n;
      const remaining = driverAgg.get(s.driverId)?.remainingCashMinor ?? 0n;
      const exposureMinor = collectedToday + remaining;
      const tier = classifyAmountTier(exposureMinor);
      const ageDays = Math.floor(ageH / 24);
      const sev = severityFor(tier, ageDays);
      anomalies.push({
        type: 'SHIFT_OVERDUE',
        severity: sev,
        amount: minorToFixed4(exposureMinor),
        amountTier: tier,
        ageDays,
        stage: 'DRIVER',
        responsible: 'DRIVER',
        driverId: s.driverId,
        branchId: s.driver?.branchId ?? null,
        reason: `Shift open for ${ageH.toFixed(1)}h (cap=${SHIFT_OVERDUE_HOURS}h). Exposure on driver: ${minorToFixed4(exposureMinor)} KD.`,
        actionLocked: ageDays < 2,
        requiresManualReview: true,
      });
    }

    // Per-flow anomalies (only for non-suppressed records).
    //
    // STABILISATION GATE: cash less than 24 real hours old NEVER
    // produces a financial anomaly here, regardless of where it sits
    // on the Kuwait calendar. The only exception is the SHIFT_OVERDUE
    // override path which is gated independently by shift duration.
    // The classifier (single source of truth) reapplies the same 24h
    // gate; this check just keeps the v2 anomaly list honest.
    for (const f of flows) {
      if (f.ignoredNonOperational) continue;
      if (f.stage === 'BANK') continue;
      const flowAgeHours =
        (generatedAt.getTime() - f.originAt.getTime()) / 3_600_000;
      if (flowAgeHours < 24 && f.driverGate !== 'SHIFT_OVERDUE') continue;
      const order = orderById.get(f.orderId);
      const custody = f.custodyId
        ? custodies.find((c) => c.id === f.custodyId)
        : null;

      if (f.stage === 'DRIVER') {
        anomalies.push(
          asAnomaly(f, 'STUCK_AT_DRIVER', 'DRIVER',
            `Cash from ${f.originDate} still on driver ${f.driverName ?? f.driverId} after ${f.ageDays} day(s) with shift CLOSED.`,
          ),
        );
      } else if (f.stage === 'DRIVER_HANDOVER') {
        anomalies.push(
          asAnomaly(f, 'HANDOVER_DELAY', 'BRANCH_MANAGER',
            'Handover shift CLOSED but no manager custody bag exists.',
          ),
        );
      } else if (f.stage === 'CUSTODY' && custody) {
        if (custody.status === ManagerCashCustodyStatus.PENDING_DEPOSIT) {
          anomalies.push(
            asAnomaly(f, 'CUSTODY_DELAY', 'BRANCH_MANAGER',
              'Manager custody bag PENDING_DEPOSIT; deposit slip not uploaded.',
            ),
          );
        }
      } else if (f.stage === 'VERIFIED' && custody) {
        // R04: DEPOSIT_NOT_REGISTERED — verified custody without a BankDepositLog row.
        if (!custody.bankDepositLog) {
          anomalies.push(
            asAnomaly(f, 'DEPOSIT_NOT_REGISTERED', 'SYSTEM',
              'Custody marked VERIFIED but no BankDepositLog row links it.',
            ),
          );
        }
      }

      // R03 + R04: amount mismatch / overpayment.
      if (custody?.bankDepositLog) {
        const cMinor = fixed4ToMinor(custody.amountKd);
        const dMinor = fixed4ToMinor(custody.bankDepositLog.amountKd);
        const delta = dMinor - cMinor;
        if (absMinor(delta) > TOLERANCE_MINOR) {
          if (delta < 0n) {
            anomalies.push(
              asAnomaly(f, 'DEPOSIT_AMOUNT_MISMATCH', 'ACCOUNTANT',
                `Bank deposit short by ${minorToFixed4(-delta)} KD vs custody (tolerance ${minorToFixed4(TOLERANCE_MINOR)} KD).`,
              ),
            );
          } else {
            anomalies.push(
              asAnomaly(f, 'OVERPAYMENT_ANOMALY', 'ACCOUNTANT',
                `Bank deposit exceeds custody by ${minorToFixed4(delta)} KD.`,
              ),
            );
          }
        }
      }

      // R04: SUBSCRIPTION_LEAKAGE — surface for review only.
      if (
        order?.subscriptionId &&
        order.posPaymentMethod === PosPaymentMethod.CASH
      ) {
        anomalies.push(
          asAnomaly(f, 'SUBSCRIPTION_LEAKAGE', 'SYSTEM',
            'Order is tied to an active subscription but was settled in CASH; verify wallet was depleted.',
          ),
        );
      }

      // R04: DOUBLE_COUNT_RISK — order is in handover-custody chain AND
      // an APPROVED legacy Deposit row exists for the same driver
      // within ±48h of the order's completedAt.
      if (
        order &&
        order.driverId &&
        f.stage !== 'DRIVER' &&
        driversWithApprovedDeposit.has(order.driverId)
      ) {
        const overlap = driverDeposits.some(
          (d) =>
            d.driverId === order.driverId &&
            d.status === 'APPROVED' &&
            order.completedAt &&
            Math.abs(d.createdAt.getTime() - order.completedAt.getTime()) <=
              48 * 3_600_000,
        );
        if (overlap) {
          anomalies.push(
            asAnomaly(f, 'DOUBLE_COUNT_RISK', 'SYSTEM',
              'Order chain includes a manager custody bag AND an APPROVED legacy driver Deposit row within ±48h.',
            ),
          );
        }
      }
    }

    // ─── Step 6 R02: tier-aware severity already applied to each
    //                anomaly via asAnomaly()/severityFor() above.
    logicApplied.push(
      'STEP 6 (R02): severity = f(ageDays, amountTier). INFO/WARNING/CRITICAL/ESCALATED.',
    );

    // ─── Step 9 R05: decision lock already stamped per anomaly. ───
    logicApplied.push(
      'STEP 9 (R05): every anomaly carries actionLocked + requiresManualReview.',
    );

    // ─── Step 10: assemble strict JSON ────────────────────────────
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

    // Add the single most informative assumption note up front.
    assumptions.push(
      'Safari-ERP has no standalone Payment table; payment events are read from Order.cashStatus + Order.posPaymentMethod plus the legacy Deposit table.',
    );
    assumptions.push(
      `SHIFT_OVERDUE cap = ${SHIFT_OVERDUE_HOURS}h (R01). Tolerance band = ${minorToFixed4(TOLERANCE_MINOR)} KD (R03). Tier thresholds: SMALL<20, MEDIUM<200, LARGE>=200 (R02).`,
    );
    assumptions.push(
      `Reporting day anchor = Asia/Kuwait calendar day ${reportDayIso}.`,
    );

    const systemHealth: CashV2Health =
      anomalies.some(
        (a) => a.severity === 'CRITICAL' || a.severity === 'CRITICAL_ESCALATED',
      )
        ? 'CRITICAL'
        : anomalies.some((a) => a.severity === 'WARNING')
          ? 'WARNING'
          : 'OK';

    const finalAssessment = composeAssessment(
      systemHealth,
      anomalies,
      flows,
      ignoredCases.length,
    );

    return {
      executionSummary: {
        dataFetched,
        logicApplied,
        ignoredCases,
        assumptions,
        toleranceKd: minorToFixed4(TOLERANCE_MINOR),
        shiftOverdueCapHours: SHIFT_OVERDUE_HOURS,
        asOfDate: reportDayIso,
        generatedAt: generatedAt.toISOString(),
      },
      systemHealth,
      summary: {
        totalCash: minorToFixed4(totalCashMinor),
        newCash: minorToFixed4(newCashMinor),
        agedCash: minorToFixed4(agedCashMinor),
        issues: anomalies.length,
      },
      locationSummary: {
        DRIVER: minorToFixed4(locDriver),
        CUSTODY: minorToFixed4(locCustody),
        BANK: minorToFixed4(locBank),
      },
      flows: liveFlows.map((f) => toPublicFlow(f, generatedAt)),
      anomalies,
      finalAssessment,
      readOnly: true,
      advisoryOnly: true,
    };
  }
}

// ─── Helpers ───────────────────────────────────────────────────────

function classifyAmountTier(minor: bigint): CashV2AmountTier {
  if (minor < SMALL_THRESHOLD_MINOR) return 'SMALL';
  if (minor <= LARGE_THRESHOLD_MINOR) return 'MEDIUM';
  return 'LARGE';
}

function severityFor(tier: CashV2AmountTier, ageDays: number): CashV2Severity {
  if (ageDays >= 2) {
    if (tier === 'LARGE') return 'CRITICAL_ESCALATED';
    if (tier === 'MEDIUM') return 'CRITICAL';
    return 'WARNING';
  }
  if (ageDays === 1) {
    if (tier === 'LARGE') return 'CRITICAL';
    if (tier === 'MEDIUM') return 'WARNING';
    return 'INFO';
  }
  // ageDays === 0 — only reachable for SHIFT_OVERDUE same-day flows.
  if (tier === 'LARGE') return 'WARNING';
  return 'INFO';
}

function asAnomaly(
  f: {
    driverId: string | null;
    branchId: string | null;
    amountMinor: bigint;
    amountTier: CashV2AmountTier;
    ageDays: number;
    stage: CashV2Stage;
  },
  type: CashV2AnomalyType,
  responsible: CashV2Responsible,
  reason: string,
): CashV2AnomalyDto {
  const severity = severityFor(f.amountTier, f.ageDays);
  return {
    type,
    severity,
    amount: minorToFixed4(f.amountMinor),
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

function toPublicFlow(
  f: {
    driverId: string | null;
    driverName: string | null;
    branchId: string | null;
    amountMinor: bigint;
    amountTier: CashV2AmountTier;
    originDate: string;
    originAt: Date;
    ageDays: number;
    stage: CashV2Stage;
    driverGate: CashV2DriverGate;
    shiftStatus: 'OPEN' | 'CLOSED' | 'NO_SHIFT';
    shiftDurationHours: number | null;
    ignoredNonOperational: boolean;
    contextReason: string;
  },
  generatedAt: Date,
): CashV2FlowDto {
  // Sub-day age, two decimals. Floored at zero so we never report
  // negative hours when clocks drift slightly across regions.
  const rawHours =
    (generatedAt.getTime() - f.originAt.getTime()) / 3_600_000;
  const ageHours = Math.max(0, Math.round(rawHours * 100) / 100);
  return {
    driverId: f.driverId ?? '',
    driverName: f.driverName,
    branchId: f.branchId,
    amount: minorToFixed4(f.amountMinor),
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

function composeAssessment(
  health: CashV2Health,
  anomalies: CashV2AnomalyDto[],
  flows: { ageDays: number; ignoredNonOperational: boolean }[],
  suppressedCount: number,
): string {
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

function kuwaitMidnightUtcFromIso(dayIso: string): Date {
  const [y, m, d] = dayIso.split('-').map(Number);
  const KUWAIT_OFFSET_MIN = 180;
  return new Date(
    Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0) -
      KUWAIT_OFFSET_MIN * 60_000,
  );
}
