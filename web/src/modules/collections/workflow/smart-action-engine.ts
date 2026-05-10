/**
 * V20.9 — Phase 3 Smart Action Engine.
 *
 * Pure, deterministic function that ranks the next-best action(s)
 * for a customer in the Collections Operations Workspace.
 *
 * # Why pure
 *
 * • Easy to unit-test (no React, no fetch, no clock).
 * • Snapshot-stable for the same input → no UI flicker on
 *   re-render.
 * • Operators see consistent priorities across workstations
 *   (same input ⇒ same recommendation).
 *
 * # Why server-canonical-only
 *
 * The engine NEVER computes financial values. Inputs are exactly
 * the boolean / string / canonical-string fields the server
 * already publishes (`paymentStatus`, `daysOverdue`, `riskLevel`,
 * `fraudSeverity`, `promiseStatus`, `slaStatus`). The action
 * itself is a presentation hint — the actual financial mutation
 * always goes through the canonical API.
 *
 * Reference inputs (all server-canonical fields):
 *
 *   • `daysOverdue: number | null`        — server-computed
 *   • `riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null`
 *   • `fraudSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null`
 *   • `promiseStatus: 'NONE' | 'ACTIVE' | 'KEPT' | 'BROKEN' | null`
 *   • `lastContactDaysAgo: number | null`
 *   • `slaStatus: 'OK' | 'AT_RISK' | 'BREACHED' | null`
 *   • `hasOpenInvoice: boolean`
 *   • `collectionsStage: string | null`
 */

export type SmartActionInput = {
  daysOverdue: number | null;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  fraudSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  promiseStatus: 'NONE' | 'ACTIVE' | 'KEPT' | 'BROKEN' | null;
  lastContactDaysAgo: number | null;
  slaStatus: 'OK' | 'AT_RISK' | 'BREACHED' | null;
  hasOpenInvoice: boolean;
  collectionsStage: string | null;
};

export type SmartActionId =
  | 'open_fraud_investigation'
  | 'block_customer'
  | 'escalate_collection'
  | 'log_broken_promise'
  | 'set_promise_to_pay'
  | 'send_payment_reminder'
  | 'place_followup_call'
  | 'request_field_visit'
  | 'mark_no_action_needed';

export type SmartAction = {
  id: SmartActionId;
  /** 0 (low) — 100 (CRITICAL). */
  priority: number;
  /** Short user-visible label (i18n key resolved at the call site). */
  labelKey: string;
  /** Why we're recommending this — for the operator tooltip. */
  reasonKey: string;
  /** True if this action is a CRITICAL-tier action (used for sort + UI emphasis). */
  critical: boolean;
};

/**
 * Returns the recommended actions, highest-priority first. ALWAYS
 * non-empty — when nothing is broken, returns
 * `mark_no_action_needed` with priority 0.
 */
export function recommendActions(input: SmartActionInput): SmartAction[] {
  const out: SmartAction[] = [];

  // 1. Fraud is always the highest-priority alarm.
  if (input.fraudSeverity === 'CRITICAL' || input.fraudSeverity === 'HIGH') {
    out.push({
      id: 'open_fraud_investigation',
      priority: 100,
      labelKey: 'collections.action.fraud.investigate',
      reasonKey: 'collections.action.fraud.reason',
      critical: true,
    });
  }

  // 2. SLA breach + critical risk → escalate immediately.
  if (
    input.slaStatus === 'BREACHED' &&
    (input.riskLevel === 'HIGH' || input.riskLevel === 'CRITICAL')
  ) {
    out.push({
      id: 'escalate_collection',
      priority: 95,
      labelKey: 'collections.action.escalate',
      reasonKey: 'collections.action.escalate.reason.sla',
      critical: true,
    });
  }

  // 3. Broken promise → log + escalate (do NOT auto-block; that
  //    is a separate, deliberate workflow).
  if (input.promiseStatus === 'BROKEN') {
    out.push({
      id: 'log_broken_promise',
      priority: 90,
      labelKey: 'collections.action.promise.brokenLog',
      reasonKey: 'collections.action.promise.brokenLog.reason',
      critical: true,
    });
  }

  // 4. CRITICAL risk + chronic overdue (>= 60d) → block customer
  //    review.
  if (
    input.riskLevel === 'CRITICAL' &&
    typeof input.daysOverdue === 'number' &&
    input.daysOverdue >= 60
  ) {
    out.push({
      id: 'block_customer',
      priority: 88,
      labelKey: 'collections.action.block',
      reasonKey: 'collections.action.block.reason',
      critical: true,
    });
  }

  // 5. Active overdue without an active promise → set promise.
  if (
    input.hasOpenInvoice &&
    typeof input.daysOverdue === 'number' &&
    input.daysOverdue > 0 &&
    input.promiseStatus !== 'ACTIVE'
  ) {
    out.push({
      id: 'set_promise_to_pay',
      priority: 70,
      labelKey: 'collections.action.promise.set',
      reasonKey: 'collections.action.promise.set.reason',
      critical: false,
    });
  }

  // 6. Stale contact (no contact in 7+ days) on an active customer
  //    with an open invoice → schedule a follow-up call.
  if (
    input.hasOpenInvoice &&
    (input.lastContactDaysAgo == null || input.lastContactDaysAgo >= 7)
  ) {
    out.push({
      id: 'place_followup_call',
      priority: 60,
      labelKey: 'collections.action.call',
      reasonKey: 'collections.action.call.reason',
      critical: false,
    });
  }

  // 7. Soft reminder for at-risk SLA without overdue.
  if (
    input.slaStatus === 'AT_RISK' &&
    (input.daysOverdue == null || input.daysOverdue <= 0)
  ) {
    out.push({
      id: 'send_payment_reminder',
      priority: 40,
      labelKey: 'collections.action.reminder',
      reasonKey: 'collections.action.reminder.reason',
      critical: false,
    });
  }

  // 8. CRITICAL but no SLA breach yet → request field visit.
  if (
    input.riskLevel === 'CRITICAL' &&
    input.slaStatus !== 'BREACHED'
  ) {
    out.push({
      id: 'request_field_visit',
      priority: 75,
      labelKey: 'collections.action.fieldVisit',
      reasonKey: 'collections.action.fieldVisit.reason',
      critical: true,
    });
  }

  if (out.length === 0) {
    out.push({
      id: 'mark_no_action_needed',
      priority: 0,
      labelKey: 'collections.action.none',
      reasonKey: 'collections.action.none.reason',
      critical: false,
    });
  }

  out.sort((a, b) => b.priority - a.priority);
  return out;
}

/**
 * Pure derivation of an "expected payment probability" tier from
 * server-canonical signals. Returns one of three buckets — NEVER a
 * percentage, NEVER a money amount. The bucket is a UX sort key,
 * not a financial value.
 */
export function paymentProbabilityTier(
  input: Pick<SmartActionInput, 'riskLevel' | 'promiseStatus' | 'daysOverdue'>,
): 'high' | 'medium' | 'low' {
  if (input.promiseStatus === 'ACTIVE') return 'high';
  if (input.promiseStatus === 'BROKEN') return 'low';
  if (input.riskLevel === 'CRITICAL') return 'low';
  if (input.riskLevel === 'HIGH') return 'low';
  if (typeof input.daysOverdue === 'number' && input.daysOverdue >= 30) {
    return 'low';
  }
  if (input.riskLevel === 'MEDIUM') return 'medium';
  return 'high';
}
