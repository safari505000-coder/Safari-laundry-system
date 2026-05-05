/**
 * CashClassifierService — fixes the FINANCIAL vs COMPLIANCE confusion.
 *
 * Reads from `CashIntelligenceV2Service.runAnalysis({})` and projects
 * the same data into a CFO-grade view where:
 *
 *   - SHIFT_* problems can never raise the dashboard to RED.
 *   - Cash < 24h old can never be CRITICAL.
 *   - Cash < 5 KD can never be CRITICAL.
 *   - Only a real chain break OR aged + material cash escalates.
 *
 * Implements the "fix the classification" spec verbatim:
 *
 *   { systemStatus, financialAlerts[], complianceAlerts[], drivers[],
 *     finalDecision }
 *
 * STRICT contract: read-only, advisory-only, never mutates.
 */
import { Injectable } from '@nestjs/common';
import { SafariRole } from '@prisma/client';
import { CashIntelligenceV2Service } from '../cash-intelligence/cash-intelligence-v2.service';
import {
  CashIntelligenceAnalysisDto,
  CashV2AnomalyDto,
  CashV2AnomalyType,
  CashV2FlowDto,
} from '../cash-intelligence/dto/cash-intelligence-analysis.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  CashClassifiedResponseDto,
  ClassifiedAlertDto,
  ClassifiedAlertSeverity,
  ClassifiedDriverDto,
  ClassifiedDriverStatus,
  ClassifiedTrafficLight,
} from './dto/cash-classified.dto';
import { CASH_RULES } from './cash-rules';

// Shared rules — must match the names used in the rest of the file.
// We alias to keep the established prose comments below intact.
const GRACE_PERIOD_HOURS = CASH_RULES.GRACE_HOURS;
const SMALL_AMOUNT_FLOOR_KD = CASH_RULES.MIN_CRITICAL_AMOUNT_KD;

/**
 * Anomaly types that represent a broken money chain. These ALWAYS
 * land in `financialAlerts[]` regardless of age — a deposit that was
 * never registered is a real risk on day 1.
 */
const FINANCIAL_CHAIN_TYPES: ReadonlySet<CashV2AnomalyType> = new Set([
  'DEPOSIT_NOT_REGISTERED',
  'DEPOSIT_AMOUNT_MISMATCH',
  'OVERPAYMENT_ANOMALY',
  'DOUBLE_COUNT_RISK',
]);

/**
 * Anomaly types that represent operational compliance signals (timing
 * concerns, not money concerns). These are NEVER critical financial
 * risk.
 */
const COMPLIANCE_TYPES: ReadonlySet<CashV2AnomalyType> = new Set([
  'SHIFT_OVERDUE',
]);

/**
 * Aging-based anomalies — financial only when cash crossed the 24h
 * grace gate. Below grace they are reclassified into compliance.
 */
const AGING_TYPES: ReadonlySet<CashV2AnomalyType> = new Set([
  'STUCK_AT_DRIVER',
  'HANDOVER_DELAY',
  'CUSTODY_DELAY',
  'SUBSCRIPTION_LEAKAGE',
]);

@Injectable()
export class CashClassifierService {
  constructor(
    private readonly v2: CashIntelligenceV2Service,
    private readonly prisma: PrismaService,
  ) {}

  async classify(): Promise<CashClassifiedResponseDto> {
    const analysis = await this.v2.runAnalysis({});
    const projection = this.composeFromAnalysis(analysis);
    // Enrich each holder row with its role so dashboards can split
    // DRIVER cash from MANAGER cash without re-querying the user
    // table client-side. Single batched lookup; internal callers that
    // hit `composeFromAnalysis` directly (cash-risk, cash-exposure,
    // system-verify, cron) keep getting the synchronous projection
    // and simply see `holderRole = null` — they never read the role.
    const holderIds = projection.drivers
      .map((d) => d.driverId)
      .filter((id): id is string => Boolean(id));
    if (holderIds.length === 0) return projection;
    const users = await this.prisma.user.findMany({
      where: { id: { in: holderIds } },
      select: { id: true, safariRole: true },
    });
    const roleById = new Map<string, SafariRole>(
      users.map((u) => [u.id, u.safariRole]),
    );
    return {
      ...projection,
      drivers: projection.drivers.map((d) => ({
        ...d,
        holderRole: roleById.get(d.driverId) ?? null,
      })),
    };
  }

  /**
   * Pure projection — exposed so the controller can pass a branch-
   * scoped analysis if a manager-scope endpoint adds that path later.
   * Returns rows with `holderRole = null`; the public `classify()`
   * wrapper enriches them via a single batched user lookup.
   */
  composeFromAnalysis(
    analysis: CashIntelligenceAnalysisDto,
  ): CashClassifiedResponseDto {
    // Index flows by driver for age + exposure lookups.
    const flowsByDriver = new Map<string, CashV2FlowDto[]>();
    for (const f of analysis.flows) {
      if (!f.driverId) continue;
      if (parseAmount(f.amount) <= 0) continue;
      const list = flowsByDriver.get(f.driverId) ?? [];
      list.push(f);
      flowsByDriver.set(f.driverId, list);
    }

    const financialAlerts: ClassifiedAlertDto[] = [];
    const complianceAlerts: ClassifiedAlertDto[] = [];

    // Step 1 + 2 + 3 — classify each anomaly.
    for (const a of analysis.anomalies) {
      const driverFlows = a.driverId
        ? (flowsByDriver.get(a.driverId) ?? [])
        : [];
      // Cash age = OLDEST flow age for the driver. Falls back to the
      // anomaly's own ageDays converted to hours when there are no
      // flow rows (e.g. SHIFT_OVERDUE on a driver who handed over but
      // forgot to close shift — no remaining cash flow to read from).
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
      } else {
        complianceAlerts.push(projected);
      }
    }

    // Step 5 — driver status. The hierarchy is:
    //   AT_RISK         → at least one FINANCIAL alert tied to driver
    //   COMPLIANCE_ONLY → at least one COMPLIANCE alert, no financial
    //   NORMAL          → no alerts at all
    //
    // We also include drivers with live cash but no alerts, so the
    // operator sees the full population.
    const driverIdsWithFinancial = new Set(
      financialAlerts.map((a) => a.driverId).filter((d): d is string => !!d),
    );
    const driverIdsWithCompliance = new Set(
      complianceAlerts.map((a) => a.driverId).filter((d): d is string => !!d),
    );

    const driverIds = new Set<string>([
      ...flowsByDriver.keys(),
      ...driverIdsWithFinancial,
      ...driverIdsWithCompliance,
    ]);

    const drivers: ClassifiedDriverDto[] = [];
    for (const driverId of driverIds) {
      const flows = flowsByDriver.get(driverId) ?? [];
      const hasFinancial = driverIdsWithFinancial.has(driverId);
      const hasCompliance = driverIdsWithCompliance.has(driverId);
      const status: ClassifiedDriverStatus = hasFinancial
        ? 'AT_RISK'
        : hasCompliance
          ? 'COMPLIANCE_ONLY'
          : 'NORMAL';

      const cashAgeHours = oldestFlowAgeHours(flows);
      const amountKd = flows.reduce((s, f) => s + parseAmount(f.amount), 0);
      const lead = flows[0];
      const shiftDurationHours =
        flows.find((f) => f.shiftStatus === 'OPEN')?.shiftDurationHours ?? null;

      drivers.push({
        driverId,
        driverName: lead?.driverName ?? driverNameFromAlerts(driverId, [
          ...financialAlerts,
          ...complianceAlerts,
        ]),
        branchId: lead?.branchId ?? null,
        // `classify()` overlays the real role; sync callers see null.
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

    // Step 4 — system status from FINANCIAL alerts ONLY.
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
}

// ─── Per-anomaly classification ─────────────────────────────────

function projectAlert(input: {
  anomaly: CashV2AnomalyDto;
  cashAgeHours: number;
  amountKd: number;
  driverFlows: CashV2FlowDto[];
}): ClassifiedAlertDto {
  const a = input.anomaly;

  // Step 1 — chain breaks are ALWAYS financial. Cap severity per
  // amount: amount < 5 KD never CRITICAL.
  if (FINANCIAL_CHAIN_TYPES.has(a.type)) {
    return finalAlert({
      anomaly: a,
      domain: 'FINANCIAL',
      type: a.type,
      severity: capSeverityByAmount(
        normaliseSeverity(a.severity),
        input.amountKd,
      ),
      cashAgeHours: input.cashAgeHours,
      reason: a.reason,
      originalType: null,
    });
  }

  // Step 3 — SHIFT_OVERDUE reclassification.
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
        reason:
          a.reason +
          ' (Reclassified COMPLIANCE: cash is fresh and/or trivial — no financial risk.)',
        originalType: 'SHIFT_OVERDUE',
      });
    }
    // Old + material cash + overdue shift → financial, but Step 3
    // explicitly caps severity at WARNING (never CRITICAL).
    return finalAlert({
      anomaly: a,
      domain: 'FINANCIAL',
      type: 'SHIFT_OVERDUE_FINANCIAL',
      severity: 'WARNING',
      cashAgeHours: input.cashAgeHours,
      reason:
        a.reason +
        ' (Reclassified FINANCIAL: cash >= 24h and amount material; capped at WARNING.)',
      originalType: 'SHIFT_OVERDUE',
    });
  }

  // Aging-based anomalies — only financial after 24h grace AND a
  // non-trivial amount. Otherwise drop into compliance.
  if (AGING_TYPES.has(a.type)) {
    const isYoung = input.cashAgeHours < GRACE_PERIOD_HOURS;
    if (isYoung || input.amountKd < SMALL_AMOUNT_FLOOR_KD) {
      return finalAlert({
        anomaly: a,
        domain: 'COMPLIANCE',
        type: a.type,
        severity: 'INFO',
        cashAgeHours: input.cashAgeHours,
        reason:
          a.reason +
          ' (Reclassified COMPLIANCE: under 24h grace or amount below 5 KD.)',
        originalType: a.type,
      });
    }
    return finalAlert({
      anomaly: a,
      domain: 'FINANCIAL',
      type: a.type,
      severity: capSeverityByAmount(
        normaliseSeverity(a.severity),
        input.amountKd,
      ),
      cashAgeHours: input.cashAgeHours,
      reason: a.reason,
      originalType: null,
    });
  }

  // Anything else (DEPOSIT_AMOUNT_MISMATCH already handled above) —
  // default to compliance to be conservative. We never escalate an
  // unknown type to CRITICAL.
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

// ─── Helpers ─────────────────────────────────────────────────────

function parseAmount(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function normaliseSeverity(
  s: CashV2AnomalyDto['severity'],
): ClassifiedAlertSeverity {
  if (s === 'CRITICAL' || s === 'CRITICAL_ESCALATED') return 'CRITICAL';
  if (s === 'WARNING') return 'WARNING';
  return 'INFO';
}

function capSeverityByAmount(
  s: ClassifiedAlertSeverity,
  amountKd: number,
): ClassifiedAlertSeverity {
  // Step 6 final guard — small amounts can never be CRITICAL.
  if (amountKd < SMALL_AMOUNT_FLOOR_KD && s === 'CRITICAL') return 'WARNING';
  return s;
}

function oldestCashAgeHours(
  flows: CashV2FlowDto[],
  a: CashV2AnomalyDto,
): number {
  if (flows.length > 0) return oldestFlowAgeHours(flows);
  // Fallback when the anomaly references a driver that has no current
  // flows. The v2 anomaly's own `ageDays` is the SHIFT age for
  // SHIFT_OVERDUE, which is not what we want — but for everything
  // else it's the cash age, so we use it cautiously: treat 0 days as
  // < 24h, otherwise convert to hours.
  if (a.type === 'SHIFT_OVERDUE') return 0;
  return Math.max(0, a.ageDays * 24);
}

function oldestFlowAgeHours(flows: CashV2FlowDto[]): number {
  let max = 0;
  for (const f of flows) if (f.ageHours > max) max = f.ageHours;
  return max;
}

function deriveSystemStatus(
  financialAlerts: ClassifiedAlertDto[],
): ClassifiedTrafficLight {
  let hasCritical = false;
  let hasWarning = false;
  for (const a of financialAlerts) {
    if (a.severity === 'CRITICAL') hasCritical = true;
    else if (a.severity === 'WARNING') hasWarning = true;
  }
  if (hasCritical) return 'RED';
  if (hasWarning) return 'YELLOW';
  return 'GREEN';
}

function finalAlert(input: {
  anomaly: CashV2AnomalyDto;
  domain: ClassifiedAlertDto['domain'];
  type: string;
  severity: ClassifiedAlertSeverity;
  cashAgeHours: number;
  reason: string;
  originalType: string | null;
}): ClassifiedAlertDto {
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function noteForDriver(input: {
  status: ClassifiedDriverStatus;
  shiftDurationHours: number | null;
  cashAgeHours: number;
  amountKd: number;
  financialAlerts: ClassifiedAlertDto[];
  complianceAlerts: ClassifiedAlertDto[];
  driverId: string;
}): string {
  if (input.status === 'AT_RISK') {
    const types = input.financialAlerts
      .filter((a) => a.driverId === input.driverId)
      .map((a) => a.type)
      .join(', ');
    return `Financial risk: ${types}.`;
  }
  if (input.status === 'COMPLIANCE_ONLY') {
    const shiftPart =
      input.shiftDurationHours !== null
        ? `Shift open ${input.shiftDurationHours.toFixed(1)}h.`
        : 'Operational concern.';
    return `${shiftPart} Cash on driver: ${input.amountKd.toFixed(
      4,
    )} KD, age ${input.cashAgeHours.toFixed(2)}h. No financial risk.`;
  }
  if (input.amountKd === 0) return 'No live cash.';
  return `Cash ${input.amountKd.toFixed(4)} KD aged ${input.cashAgeHours.toFixed(
    2,
  )}h within grace period — normal.`;
}

function composeFinalDecision(input: {
  systemStatus: ClassifiedTrafficLight;
  financialAlerts: ClassifiedAlertDto[];
  complianceAlerts: ClassifiedAlertDto[];
  drivers: ClassifiedDriverDto[];
}): string {
  const fin = input.financialAlerts.length;
  const comp = input.complianceAlerts.length;
  const atRisk = input.drivers.filter((d) => d.status === 'AT_RISK').length;
  const compOnly = input.drivers.filter(
    (d) => d.status === 'COMPLIANCE_ONLY',
  ).length;

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

function driverSorter(
  a: ClassifiedDriverDto,
  b: ClassifiedDriverDto,
): number {
  const order = { AT_RISK: 0, COMPLIANCE_ONLY: 1, NORMAL: 2 } as const;
  if (order[a.status] !== order[b.status])
    return order[a.status] - order[b.status];
  return parseAmount(b.amount) - parseAmount(a.amount);
}

function sortAlerts(alerts: ClassifiedAlertDto[]): ClassifiedAlertDto[] {
  const sevRank = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  return alerts
    .slice()
    .sort(
      (a, b) =>
        sevRank[a.severity] - sevRank[b.severity] ||
        parseAmount(b.amount) - parseAmount(a.amount),
    );
}

function driverNameFromAlerts(
  driverId: string,
  alerts: ClassifiedAlertDto[],
): string | null {
  for (const a of alerts) {
    if (a.driverId === driverId && a.driverName) return a.driverName;
  }
  return null;
}
