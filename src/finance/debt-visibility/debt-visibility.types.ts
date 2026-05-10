/**
 * V20.4 — Phase 3 / Phase 16 canonical visibility contract.
 *
 * Every operational read of "what does customer X owe?" goes
 * through {@link DebtVisibilityService}. This file is the single
 * place to add a new field — adding it here AND in the snapshot
 * projection guarantees every screen picks it up automatically.
 */

export type CustomerVisibleDebt = {
  customerId: string;
  /** Canonical KD figure every UI MUST render. 4-dp string. */
  remainingDebtKd: string;
  /** Σ paid across in-scope invoices. 4-dp string. */
  paidTotalKd: string;
  /** Σ gross of in-scope invoices. 4-dp string. */
  totalInvoicesKd: string;
  /** Live Journal AR (account 1300). 4-dp string. */
  journalArBalanceKd: string;
  /** Net wallet liability (account 2100). 4-dp string. */
  walletLiabilityKd: string;
  /** Live wallet (prepaid balance, NOT debt). 4-dp string. */
  walletBalanceKd: string;
  unpaidInvoicesCount: number;
  partiallyPaidInvoicesCount: number;
  activeInvoicesCount: number;
  overdueInvoicesCount: number;
  /** True iff `remainingDebtKd > tolerance`. */
  hasDebt: boolean;
  lastPaymentAt: string | null;
  lastInvoiceAt: string | null;
  /** Provenance — was the canonical figure backed by Journal AR or remaining-balance? */
  canonicalSource: 'JOURNAL_AR' | 'PARTIAL_PAYMENT_REMAINING' | 'JOURNAL_AR_FALLBACK';
  /** True iff the row was served from the read-side projection. */
  fromSnapshot: boolean;
  /** When the snapshot row was last refreshed (null when computed live). */
  snapshotRefreshedAt: string | null;
};

export type CollectionsSnapshot = {
  /** Σ remainingDebtKd across all in-scope customers. */
  totalRemainingDebtKd: string;
  customersWithDebt: number;
  partiallyPaidInvoices: number;
  unpaidInvoices: number;
  overdueInvoices: number;
  generatedAt: string;
};

export type SubscriberDebtSnapshot = {
  customerId: string;
  remainingDebtKd: string;
  hasDebt: boolean;
  /** Population by `CustomerSubscription.status === ACTIVE` AND `expiresAt > now`. */
  hasActiveSubscription: boolean;
};

export type InvoiceVisibility = {
  orderId: string;
  totalKd: string;
  paidKd: string;
  remainingKd: string;
  paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
  isPartiallyPaid: boolean;
  isFullyPaid: boolean;
};
