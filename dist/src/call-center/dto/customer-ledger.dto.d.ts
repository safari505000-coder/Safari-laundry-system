import { CashStatus, CustomerSubscriptionStatus, LedgerTransactionType, OrderStatus, PosPaymentMethod, SafariRole } from '@prisma/client';
export declare class CustomerLedgerQueryDto {
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
}
export declare class CustomerLedgerHeaderDto {
    id: string;
    displayName: string | null;
    phone: string | null;
    phone2: string | null;
    originBranchId: string | null;
    originBranchName: string | null;
    walletBalanceKd: string;
    walletDebtKd: string;
}
export declare class CustomerLedgerSubscriptionDto {
    id: string;
    status: CustomerSubscriptionStatus;
    planNameSnapshot: string;
    planSalePriceKd: string;
    planActualBalanceKd: string;
    planValidityDays: number;
    carriedBalanceKd: string;
    parentSubscriptionId: string | null;
    activatedAtIso: string;
    expiresAtIso: string;
    closedAtIso: string | null;
    closedReason: string | null;
}
export type CustomerLedgerEventKind = 'SUBSCRIPTION_ACTIVATION' | 'SUBSCRIPTION_ROLLOVER_CARRY' | 'ORDER_SETTLEMENT' | 'PARTIAL_DEBT_PAYMENT';
export declare class CustomerLedgerActivationBreakdownDto {
    totalCollectedKd: string;
    actualBalanceKd: string;
    subsidyKd: string;
    debtSettledKd: string;
    creditedToBalanceKd: string;
    carriedBalanceKd: string;
}
export declare class CustomerLedgerClosedInvoiceDto {
    id: string;
    serial: string | null;
    totalKd: string;
    createdAtIso: string;
}
export declare class CustomerLedgerEventDto {
    id: string;
    atIso: string;
    rawType: LedgerTransactionType;
    kind: CustomerLedgerEventKind;
    amountKd: string;
    balanceBeforeKd: string;
    balanceAfterKd: string;
    debtBeforeKd: string;
    debtAfterKd: string;
    debtSettledKd: string;
    debtDiscountKd: string;
    paymentMethod: PosPaymentMethod | null;
    orderId: string | null;
    orderSerial: string | null;
    subscriptionId: string | null;
    subscriptionLabel: string | null;
    performedByUserId: string | null;
    performedByName: string | null;
    performedByRole: SafariRole | null;
    note: string | null;
    activationBreakdown: CustomerLedgerActivationBreakdownDto | null;
    closedInvoices: CustomerLedgerClosedInvoiceDto[];
}
export declare class CustomerLedgerInvoiceDto {
    id: string;
    serial: string | null;
    createdAtIso: string;
    completedAtIso: string | null;
    totalKd: string;
    status: OrderStatus;
    cashStatus: CashStatus;
    paymentMethod: PosPaymentMethod | null;
    driverName: string | null;
    branchName: string | null;
    subscriptionId: string | null;
    subscriptionStatus: CustomerSubscriptionStatus | null;
    subscriptionLabel: string | null;
    issuedWhileCutOff: boolean;
    openDebt: boolean;
}
export declare class CustomerLedgerResponseDto {
    customer: CustomerLedgerHeaderDto;
    activeSubscription: CustomerLedgerSubscriptionDto | null;
    isCutOff: boolean;
    fromIso: string | null;
    toIso: string | null;
    events: CustomerLedgerEventDto[];
    invoices: CustomerLedgerInvoiceDto[];
    totals: {
        eventCount: number;
        invoiceCount: number;
        openInvoiceCount: number;
        totalCollectedKd: string;
        totalDiscountedKd: string;
    };
}
