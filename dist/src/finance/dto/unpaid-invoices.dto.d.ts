export declare class UnpaidInvoicesQueryDto {
    from?: string;
    to?: string;
    branchId?: string;
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
    entryCount: number;
    currentCustomerDebtKd: string;
    isOpen: boolean;
    lastEntryAt: string;
}
export declare class UnpaidInvoicesKpisDto {
    invoiceCount: number;
    openInvoiceCount: number;
    customerCount: number;
    openCustomerCount: number;
    totalDebtKd: string;
    openDebtKd: string;
    avgDebtPerInvoiceKd: string;
}
export declare class UnpaidInvoicesResponseDto {
    from: string | null;
    to: string | null;
    kpis: UnpaidInvoicesKpisDto;
    rows: UnpaidInvoiceRowDto[];
}
