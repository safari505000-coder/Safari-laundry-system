/** Breakdown returned after subscription activation (debt settled before balance credit). */
export type SubscriptionActivationSettlement = {
  totalCollected: string;
  debtSettled: string;
  creditedToBalance: string;
  previousBalance: string;
  previousDebt: string;
  newBalance: string;
  newDebt: string;
  /**
   * V19.4 — CC pack #2. ID of the freshly-created `CustomerSubscription`
   * row. The caller (call-centre controller) can surface this to the
   * operator so the "View statement" link is deep-linkable immediately
   * after activation.
   */
  subscriptionId: string;
  /**
   * ID of the subscription this activation replaced, or null when this
   * was the very first subscription for the customer. Useful for the
   * audit trail and the UI "rolled over from…" breadcrumb.
   */
  rolledOverFromSubscriptionId: string | null;
  /**
   * Signed delta (in d.ك string, 4-dp precision) carried forward from
   * the predecessor subscription. Positive = prior prepaid credit,
   * negative = prior outstanding debt, zero = first subscription or
   * an exactly balanced predecessor.
   */
  carriedBalanceKd: string;
  /**
   * V19.7.4 — populated only when the caller opted in to
   * `autoCloseInvoices` (i.e. the "Convert debt → subscription"
   * path). Lists the `Order.id`s whose `cashStatus` was flipped to
   * `PAID_TO_DRIVER` via FIFO allocation of the debt-settled amount,
   * so the UI can invalidate its debt-tracking cache and the audit
   * trail has a concrete before/after for each closed invoice.
   * Empty array when the flag was off, the debt reduction was zero,
   * or no invoice was fully covered.
   */
  closedInvoiceIds: string[];
  /**
   * V19.13 — UNPAID invoices paid in full from prepaid `wallet.balance`
   * immediately after activation (FIFO, oldest first). Server-driven; no
   * frontend flag required.
   */
  prepaidAutoReconciledOrderIds: string[];
};
