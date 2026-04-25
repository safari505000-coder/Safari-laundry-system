export declare class UnpaidInvoicesQueryDto {
    from?: string;
    to?: string;
    branchId?: string;
    marketKpiBranchId?: string;
    actorUserId?: string;
    customerPhone?: string;
}
export declare class UnpaidInvoiceRowDto {
    orderId: string;
    serialNumber: string | null;
    invoiceNumber: string | null;
    issuedAt: string;
    customerId: string;
    customerName: string;
    customerPhone: string | null;
    customerPhone2: string | null;
    branchId: string | null;
    branchName: string | null;
    actorUserId: string | null;
    actorUserName: string | null;
    actorUserRole: string | null;
    invoiceTotalKd: string;
    debtAmountKd: string;
    paidKd: string;
    remainingKd: string;
    entryCount: number;
    currentCustomerDebtKd: string;
    isOpen: boolean;
    debtSource: 'INVOICE_SHORTFALL' | 'SUBSCRIPTION_OVERUSE' | 'OPEN_UNPAID_ORDER';
    lastEntryAt: string;
}
export declare class MarketUnpaidByMethodDto {
    cashKd: string;
    knetKd: string;
    onlineKd: string;
    paymentLinkKd: string;
    otherKd: string;
}
export declare class UnpaidInvoicesKpisDto {
    invoiceCount: number;
    openInvoiceCount: number;
    customerCount: number;
    openCustomerCount: number;
    totalInvoicesKd: string;
    totalDebtKd: string;
    totalPaidKd: string;
    openDebtKd: string;
    openShortfallDebtKd: string;
    openSubscriptionOveruseDebtKd: string;
    openUnpaidOrderBalanceKd: string;
    totalMarketUnpaidKd: string;
    marketUnpaidByMethod: MarketUnpaidByMethodDto;
    avgDebtPerInvoiceKd: string;
}
export declare class UnpaidInvoicesResponseDto {
    from: string | null;
    to: string | null;
    kpis: UnpaidInvoicesKpisDto;
    rows: UnpaidInvoiceRowDto[];
}
