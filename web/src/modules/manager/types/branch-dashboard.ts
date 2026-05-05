/**
 * V19.33 — Branch Manager Dashboard — DTO mappings.
 *
 * STRICT RULE: this file MUST NOT redefine money math or recompute
 * totals. It only re-exports backend DTO shapes from `@/lib/api` plus
 * the small UI-only filter / status enums the dashboard owns locally.
 *
 * If the backend contract changes (e.g. a new alert code), update the
 * source-of-truth type in `@/lib/api` first, then this file is a
 * one-line import bump.
 */
import type {
  CashControlReconciliation,
  CashControlTimeline,
  DriverOversightCard,
  FinanceAlertDto,
  LowStockResponse,
} from '@/lib/api';

export type BranchReconciliation = CashControlReconciliation;
export type BranchReconciliationDriverRow =
  CashControlReconciliation['breakdown'][number];
export type BranchReconciliationAlert =
  CashControlReconciliation['alerts'][number];
export type BranchReconciliationFlow = NonNullable<
  CashControlReconciliation['flows']
>[number];
export type BranchReconciliationStatus =
  CashControlReconciliation['status'];

export type BranchTimeline = CashControlTimeline;
export type BranchTimelineEvent = CashControlTimeline['events'][number];

export type BranchDriverCard = DriverOversightCard;

export type BranchFinanceAlert = FinanceAlertDto;
export type BranchAlertSeverity = FinanceAlertDto['severity'];

export type BranchLowStockReport = LowStockResponse;
export type BranchLowStockRow = LowStockResponse['rows'][number];

/* ─── UI-only filter shape (no money) ───────────────────────────── */

export type DriverStatusFilter =
  | 'ALL'
  | 'ACTIVE'
  | 'NEED_HANDOVER'
  | 'COMPLETED'
  | 'IDLE';

export type PaymentTypeFilter =
  | 'ALL'
  | 'CASH'
  | 'KNET'
  | 'ONLINE'
  | 'SUBSCRIPTION_WALLET'
  | 'DEBT_ON_ACCOUNT';

export type DashboardFilters = {
  /** Kuwait-local YYYY-MM-DD. The hook passes this verbatim to backend. */
  date: string;
  /** Multi-select driverIds (subset of branch's drivers). Empty = all branch drivers. */
  driverIds: string[];
  status: DriverStatusFilter;
  paymentType: PaymentTypeFilter;
};

/**
 * Per-row driver status, derived from backend numbers ONLY (we read
 * `collected` and `handed` as opaque decimal strings and compare them
 * for emptiness — we never sum, subtract, or repaint money values).
 *
 *  - NEED_HANDOVER : driver collected cash today but did not hand all of it over
 *  - COMPLETED     : driver collected cash today AND fully handed over (handed === collected)
 *  - IDLE          : driver had zero orders today (no row in reconciliation breakdown)
 *  - ACTIVE        : on-shift driver still issuing invoices (today's row has no settled cash yet)
 */
export type DriverRowStatus =
  | 'NEED_HANDOVER'
  | 'COMPLETED'
  | 'IDLE'
  | 'ACTIVE';
