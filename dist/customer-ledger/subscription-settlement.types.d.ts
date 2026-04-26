export type SubscriptionActivationSettlement = {
    totalCollected: string;
    debtSettled: string;
    creditedToBalance: string;
    previousBalance: string;
    previousDebt: string;
    newBalance: string;
    newDebt: string;
    subscriptionId: string;
    rolledOverFromSubscriptionId: string | null;
    carriedBalanceKd: string;
    closedInvoiceIds: string[];
    prepaidAutoReconciledOrderIds: string[];
};
