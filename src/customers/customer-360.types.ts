import type { CustomerSubscriptionStatus } from '@prisma/client';

/**
 * Canonical money block — single computation for Customer 360; identical
 * numeric strings in internal vs sanitized responses (presentation-only diffs elsewhere).
 */
export type Customer360FinancialsDto = {
  consumedKd: string;
  totalInvoicesKd: string;
  subscriptionValueKd: string;
  subscriptionConsumedKd: string;
  subscriptionRemainingKd: string;
  totalPaymentsKd: string;
  /**
   * V20.4 Phase 2 + V23.2 — canonical receivable debt. The single
   * number every UI surface (Customer 360, Subscribers list,
   * Outstanding, Collections, dashboards) MUST display for any
   * "outstanding balance" / "إجمالي المديونية" tile.
   *
   * Sourced from {@link computeCanonicalCustomerDebt} so it equals
   * the live Journal AR (`USE_JOURNAL_AS_SOURCE=true` + V20.3) or
   * the partial-payment-aware Σ remaining_balance otherwise.
   *
   * V23.2 — the legacy `totalDueKd` field (= `totalInvoices −
   * totalPayments`) was removed from this DTO entirely. The engine
   * still computes the gross internally for invariant tests, but
   * the value never crosses the wire so consumers can NEVER fall
   * back to it. Every consumer now reads `canonicalDebtKd`.
   */
  canonicalDebtKd: string;
  /** Provenance — JOURNAL_AR | PARTIAL_PAYMENT_REMAINING | JOURNAL_AR_FALLBACK. */
  canonicalDebtSource:
    | 'JOURNAL_AR'
    | 'PARTIAL_PAYMENT_REMAINING'
    | 'JOURNAL_AR_FALLBACK'
    | 'SNAPSHOT_FALLBACK';
  overpaymentBalanceKd: string;
  isBlocked: boolean;
  blockReason: string | null;
  blockedAtIso: string | null;
  /**
   * V20.8.1 — explicit financial breakdown.
   *
   * Pre-V20.8.1 the UI mixed three orthogonal concepts under one
   * "balance" label, which led to operator confusion (e.g. seeing
   * `balance = 0` next to an active subscription with prepaid
   * value remaining). The breakdown surfaces them separately so
   * every UI can render the right label per concept WITHOUT
   * doing arithmetic in the client.
   *
   * Concepts (all server-canonical strings, never recomputed
   * client-side):
   *   • `receivableDebtKd`       — what the customer owes us
   *                                (= `canonicalDebtKd`).
   *   • `subscriptionRemainingKd` — usable balance inside the
   *                                active subscription package.
   *   • `walletPrepaidCreditKd`  — non-subscription prepaid
   *                                credit on file
   *                                (max(0, walletBalance - subscriptionRemaining)).
   *   • `paidTotalKd`            — historical settlements
   *                                (= `totalPaymentsKd`).
   */
  breakdown: Customer360FinancialBreakdownDto;
};

/**
 * V20.8.1 — explicit per-concept financial breakdown. Canonical
 * source of truth for the V20.8.1 UI rewrites; consumers MUST
 * pick the field that matches the concept they want to render
 * and never sum/subtract them client-side.
 */
export type Customer360FinancialBreakdownDto = {
  /** What the customer OWES us (canonical receivable debt). */
  receivableDebtKd: string;
  /** Usable balance inside the active subscription package. */
  subscriptionRemainingKd: string;
  /** Non-subscription prepaid credit on file (excludes subscription). */
  walletPrepaidCreditKd: string;
  /** Historical total of payments that have settled. */
  paidTotalKd: string;
  /** Plain-language operator hint summarising the four numbers. */
  operatorHint: string;
};

export type Customer360StatementDto = {
  financials: Customer360FinancialsDto;
  /** Optional human-readable lines (may contain internal vocabulary before sanitize). */
  narrativeLines?: string[];
};

export type Customer360SubscriptionFinancialsDto = {
  subscriptionValueKd: string;
  subscriptionConsumedKd: string;
  subscriptionRemainingKd: string;
};

export type Customer360SubscriptionDto = {
  id: string;
  status: CustomerSubscriptionStatus;
  planNameSnapshot: string;
  planSalePriceKd: string;
  planActualBalanceKd: string;
  planValidityDays: number;
  carriedBalanceKd: string;
  activatedAtIso: string;
  expiresAtIso: string;
  closedAtIso: string | null;
  closedReason: string | null;
};

export type Customer360ScoreDto = {
  value: number;
  feedbackAverage: number | null;
  factors: string[];
};

export type Customer360InsightsDto = {
  summary: string;
  detail: string;
};

export type Customer360AlertDto = {
  code: string;
  message: string;
};

export type Customer360CustomerDto = {
  id: string;
  displayName: string | null;
  phone: string;
  phone2: string | null;
};

/** Full internal payload (call center). */
export type Customer360InternalDto = {
  customer: Customer360CustomerDto;
  subscriptions: Customer360SubscriptionDto[];
  subscription: Customer360SubscriptionFinancialsDto;
  statement: Customer360StatementDto;
  rating: 'GOOD' | 'WATCH' | 'BLOCKED';
  insight: string;
  score: Customer360ScoreDto;
  insights: Customer360InsightsDto;
  alerts: Customer360AlertDto[];
  internalNotes: string | null;
};

/** Customer-safe payload after `sanitizeCustomerView`. */
export type Customer360SanitizedDto = {
  customer: Customer360CustomerDto;
  subscriptions: Customer360SubscriptionDto[];
  subscription: Customer360SubscriptionFinancialsDto;
  statement: Customer360StatementDto;
  rating: 'GOOD' | 'WATCH' | 'BLOCKED';
  insight: string;
  score: null;
  insights: null;
  friendlySummary: string;
};
