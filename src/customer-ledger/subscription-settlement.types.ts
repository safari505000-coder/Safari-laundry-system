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
};
