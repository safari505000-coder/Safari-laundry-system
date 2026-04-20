export declare class SubscriptionInvoiceRowDto {
    orderId: string;
    invoiceNumber?: string;
    totalPriceKd: string;
    status: string;
    cashStatus: string;
    createdAtIso: string;
    completedAtIso?: string;
}
export declare class CustomerSubscriptionRowDto {
    id: string;
    status: string;
    planNameSnapshot: string;
    planSalePriceSnapshot: string;
    planActualBalanceSnapshot: string;
    planValidityDaysSnapshot: number;
    carriedBalanceKd: string;
    parentSubscriptionId?: string;
    activatedAtIso: string;
    expiresAtIso: string;
    closedAtIso?: string;
    closedReason?: string;
    invoices: SubscriptionInvoiceRowDto[];
}
