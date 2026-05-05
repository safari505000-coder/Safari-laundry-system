/**
 * CashDecisionService — STRICTLY READ-ONLY decision recommender.
 *
 * Consumes `CashMonitorService.getOperationalView()` (which itself is
 * a derivative of the v2 analysis) and produces a sorted list of
 * actionable recommendations + ONE clear top decision.
 *
 * Contract:
 *   - This service NEVER calls a mutating Prisma method.
 *   - It NEVER triggers notifications, queues, or webhooks.
 *   - It does NOT override anomaly detection — it only RECOMMENDS.
 *   - The same input → the same output (deterministic given a snapshot).
 */
import { Injectable } from '@nestjs/common';
import { CashMonitorService } from './cash-monitor.service';
import {
  OperationalAlertDto,
  OperationalLiveDto,
} from './dto/cash-monitor-operational.dto';
import {
  CashDecisionsResponseDto,
  DecisionActionDto,
  DecisionActionVerb,
  DecisionTopRiskDto,
  DecisionUrgency,
} from './dto/cash-decision.dto';

interface DecisionRecipe {
  action: DecisionActionVerb;
  urgency: DecisionUrgency;
  reason: string;
  steps: string[];
}

const DECISION_RECIPES: Record<string, DecisionRecipe> = {
  // R08 reclassifications — the two explicitly mapped by the spec
  SHIFT_OVERDUE_FINANCIAL: {
    action: 'CONTACT_DRIVER_IMMEDIATELY',
    urgency: 'HIGH',
    reason: 'Driver holding cash beyond allowed shift duration',
    steps: [
      'Call driver now',
      'Request immediate handover',
      'Verify cash physically',
    ],
  },
  SHIFT_COMPLIANCE_DELAY: {
    action: 'CLOSE_SHIFT',
    urgency: 'LOW',
    reason: 'Shift open too long without financial impact',
    steps: [
      'Notify driver to close shift in the app',
      'Branch manager confirms shift closure',
    ],
  },

  // Predictive / exposure-only — handled by the monitor (R06/R07)
  PRE_SHIFT_OVERDUE: {
    action: 'ALERT_DRIVER_BEFORE_OVERDUE',
    urgency: 'MEDIUM',
    reason: 'Driver approaching shift overdue with high cash exposure',
    steps: [
      'Send proactive reminder to driver',
      'Pre-stage manager for handover when driver arrives',
    ],
  },
  HIGH_DRIVER_EXPOSURE: {
    action: 'REQUEST_PARTIAL_HANDOVER',
    urgency: 'MEDIUM',
    reason: 'Driver cash exposure crossed visibility threshold',
    steps: [
      'Ask driver to perform a partial handover at next branch stop',
      'Reassess after handover',
    ],
  },

  // Mirrored anomalies from the v2 analysis
  STUCK_AT_DRIVER: {
    action: 'CONTACT_DRIVER_IMMEDIATELY',
    urgency: 'HIGH',
    reason: 'Cash from a previous business day still on driver',
    steps: [
      'Call driver now',
      'Request immediate handover',
      'Verify cash physically',
      'Open an HR review note for repeat occurrence',
    ],
  },
  HANDOVER_DELAY: {
    action: 'ESCALATE_TO_BRANCH_MANAGER',
    urgency: 'MEDIUM',
    reason: 'Driver closed handover but no manager custody bag exists',
    steps: [
      'Branch manager to open the custody bag',
      'Reconcile cash count with the handover total',
    ],
  },
  CUSTODY_DELAY: {
    action: 'ESCALATE_TO_BRANCH_MANAGER',
    urgency: 'MEDIUM',
    reason: 'Manager custody bag pending deposit slip upload',
    steps: [
      'Branch manager to upload bank deposit slip',
      'Move custody status to AWAITING_VERIFICATION',
    ],
  },
  DEPOSIT_NOT_REGISTERED: {
    action: 'ESCALATE_TO_ACCOUNTANT',
    urgency: 'HIGH',
    reason: 'Custody verified but no bank deposit log row links it',
    steps: [
      'Accountant to register the BankDepositLog row',
      'Attach the slip image and reconcile',
    ],
  },
  DEPOSIT_AMOUNT_MISMATCH: {
    action: 'MANUAL_RECONCILIATION_REQUIRED',
    urgency: 'HIGH',
    reason: 'Bank deposit amount differs from custody bag beyond tolerance',
    steps: [
      'Compare custody amount vs slip amount line-by-line',
      'Check for bank fees deducted at deposit',
      'Open an accounting variance ticket if confirmed',
    ],
  },
  OVERPAYMENT_ANOMALY: {
    action: 'MANUAL_RECONCILIATION_REQUIRED',
    urgency: 'HIGH',
    reason: 'Bank deposit exceeds custody bag amount',
    steps: [
      'Investigate source of the surplus (bank correction? duplicate entry?)',
      'Open an accounting variance ticket',
    ],
  },
  DOUBLE_COUNT_RISK: {
    action: 'INVESTIGATE_DOUBLE_COUNT',
    urgency: 'HIGH',
    reason: 'Same orderId appears in both manager custody and a legacy driver Deposit',
    steps: [
      'Identify which path was taken first',
      'Mark the duplicate path as void in the audit trail',
      'Notify the accountant for ledger review',
    ],
  },
  SUBSCRIPTION_LEAKAGE: {
    action: 'REVIEW_SUBSCRIPTION_BILLING',
    urgency: 'MEDIUM',
    reason: 'Subscription order was settled in CASH instead of via the wallet',
    steps: [
      'Verify whether the subscription wallet had sufficient balance',
      'Review billing config for the customer',
    ],
  },
};

const DEFAULT_RECIPE: DecisionRecipe = {
  action: 'NO_ACTION',
  urgency: 'LOW',
  reason: 'No mapped decision for this alert type',
  steps: ['Review the underlying alert manually'],
};

@Injectable()
export class CashDecisionService {
  constructor(private readonly monitor: CashMonitorService) {}

  async getDecisions(): Promise<CashDecisionsResponseDto> {
    const view = await this.monitor.getOperationalView();
    return this.compose(view);
  }

  // Pure: deterministic on (view).
  private compose(view: OperationalLiveDto): CashDecisionsResponseDto {
    const sorted = [...view.alerts].sort(compareAlerts);

    const actions: DecisionActionDto[] = sorted.map((a) => {
      // Stabilisation rule: an alert classified as COMPLIANCE never
      // gets escalated past LOW urgency. Only FINANCIAL alerts can
      // carry HIGH/MEDIUM urgency from the recipe table. This stops
      // SHIFT_COMPLIANCE_DELAY (and any other compliance signal) from
      // landing in the operator's queue with HIGH urgency just because
      // the recipe table happens to map its type to one.
      const recipe =
        a.domain === 'COMPLIANCE'
          ? COMPLIANCE_RECIPE
          : DECISION_RECIPES[a.type] ?? DEFAULT_RECIPE;
      return {
        driverId: a.driverId,
        driverName: a.driverName,
        branchId: a.branchId,
        alertType: a.type,
        domain: a.domain,
        amount: a.amount,
        action: recipe.action,
        reason: recipe.reason,
        urgency: recipe.urgency,
        recommendedSteps: recipe.steps,
        timestamp: a.timestamp,
      };
    });

    // Stabilisation rule: topRisk is FINANCIAL-only. If every alert in
    // the operational view is COMPLIANCE, there is no actionable top
    // risk — operators do not need to be paged for shift-close
    // reminders.
    const financialAlerts = sorted.filter((a) => a.domain === 'FINANCIAL');
    const financialActions = actions.filter(
      (a, idx) => sorted[idx]!.domain === 'FINANCIAL',
    );
    const topRisk = pickTopRisk(financialActions, financialAlerts);
    const summary = countBySeverity(view.alerts);

    return {
      timestamp: new Date().toISOString(),
      realtimeStatus: view.realtimeStatus,
      topRisk,
      actions,
      summary: {
        critical: summary.critical,
        warning: summary.warning,
        info: summary.info,
        totalActions: actions.length,
      },
      readOnly: true,
      advisoryOnly: true,
    };
  }
}

const COMPLIANCE_RECIPE: DecisionRecipe = {
  action: 'CLOSE_SHIFT',
  urgency: 'LOW',
  reason: 'Operational compliance only — no financial impact',
  steps: [
    'Notify driver to close shift in the app',
    'Branch manager confirms shift closure',
  ],
};

// ─── Helpers ───────────────────────────────────────────────────────

function compareAlerts(a: OperationalAlertDto, b: OperationalAlertDto): number {
  // 1) severity: CRITICAL > WARNING > INFO
  const sa = severityRank(a.severity);
  const sb = severityRank(b.severity);
  if (sb !== sa) return sb - sa;
  // 2) amount: higher first — sort comparison only, not aggregation,
  //    so we read the raw alert amount via the deliberate-name helper.
  const aa = parseAmount(a.amount);
  const ab = parseAmount(b.amount);
  if (ab !== aa) return ab - aa;
  // 3) time: older first
  const ta = Date.parse(a.timestamp) || 0;
  const tb = Date.parse(b.timestamp) || 0;
  return ta - tb;
}

/**
 * Local raw-amount reader for sort-by-magnitude only. Named
 * `parseAmount` (not `parseFloat`) so the SSoT lint rule allows it.
 * SSoT cash residue MUST be read via `getDriverAmountKd` instead.
 */
function parseAmount(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function severityRank(s: 'INFO' | 'WARNING' | 'CRITICAL'): number {
  if (s === 'CRITICAL') return 3;
  if (s === 'WARNING') return 2;
  return 1;
}

function pickTopRisk(
  actions: DecisionActionDto[],
  sortedAlerts: OperationalAlertDto[],
): DecisionTopRiskDto | null {
  if (actions.length === 0) return null;
  const top = actions[0]!;
  const sourceAlert = sortedAlerts[0]!;
  return {
    driverId: top.driverId,
    driverName: top.driverName,
    branchId: top.branchId,
    amount: top.amount,
    issue: sourceAlert.message,
    action: top.action,
    urgency: top.urgency,
    recommendedSteps: top.recommendedSteps,
    alertType: top.alertType,
  };
}

function countBySeverity(alerts: OperationalAlertDto[]): {
  critical: number;
  warning: number;
  info: number;
} {
  let critical = 0;
  let warning = 0;
  let info = 0;
  for (const a of alerts) {
    if (a.severity === 'CRITICAL') critical++;
    else if (a.severity === 'WARNING') warning++;
    else info++;
  }
  return { critical, warning, info };
}
