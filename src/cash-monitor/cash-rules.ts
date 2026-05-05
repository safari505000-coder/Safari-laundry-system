/**
 * CASH_RULES — single source of truth for the financial thresholds
 * that govern the entire Cash Intelligence stack.
 *
 * Every layer (classifier, risk, executive, decisions, exposure,
 * monitor) MUST import these values instead of declaring its own
 * magic numbers. This guarantees a future tweak (e.g. moving the
 * grace gate from 24h to 36h) propagates everywhere atomically and
 * cannot drift between services.
 *
 * STRICT contract:
 *   - These values are NOT runtime-configurable. They encode the
 *     financial policy the auditor signed off on. Any change MUST
 *     ship with an updated safety audit (`scripts/audit-cash-intelligence.mjs`)
 *     and a new `SystemVerifyService` scenario when relevant.
 *   - The numbers below MUST match the policy comments embedded in
 *     `cash-classifier.service.ts` and `cash-risk.service.ts`. The
 *     unit tests (and the runtime audit) re-assert this.
 */

/**
 * Number of hours a freshly-recorded cash flow stays in the grace
 * window. Anything strictly under this threshold is NEW_CASH —
 * never a financial alert, never a risk anomaly, never escalates the
 * dashboard. Crossing the gate (>=) is what unlocks aging-based
 * classification (STUCK_AT_DRIVER, HANDOVER_DELAY, etc.).
 */
export const GRACE_HOURS = 24;

/**
 * Hard amount floor (in KD) below which an aged-cash anomaly never
 * surfaces as financial risk. Used by:
 *   - the classifier as `SMALL_AMOUNT_FLOOR_KD`
 *   - the risk engine as `ANOMALY_AMOUNT_FLOOR_KD`
 *   - the executive composer (via classifier passthrough)
 *
 * Conceptually: "if the at-risk cash is less than 5 KD, the cost of
 * raising a financial alert exceeds the exposure." This number also
 * caps severity for chain-break anomalies whose amount is below the
 * floor (CRITICAL → WARNING).
 */
export const MIN_CRITICAL_AMOUNT_KD = 5;

/**
 * Open-shift duration cap. When a driver's open shift exceeds this
 * many hours, the risk engine raises a SHIFT_COMPLIANCE_ONLY signal.
 * It is NEVER a financial alert on its own — the classifier's
 * SHIFT_OVERDUE reclassification rules require BOTH the cap AND
 * material aged cash before promoting to FINANCIAL.
 */
export const SHIFT_CAP_HOURS = 16;

/**
 * Convenience export to the same numbers under a single namespace.
 * Use the named exports above when you only need one value; use
 * `CASH_RULES.X` when documenting that the call site obeys the
 * full contract.
 */
export const CASH_RULES = Object.freeze({
  GRACE_HOURS,
  MIN_CRITICAL_AMOUNT_KD,
  SHIFT_CAP_HOURS,
});

export type CashRules = typeof CASH_RULES;
