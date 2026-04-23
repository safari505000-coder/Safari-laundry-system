export declare class OpenDebtByIssuerQueryDto {
    branchId?: string;
}
export declare class OpenDebtByIssuerRowDto {
    issuer: 'DRIVER' | 'BRANCH' | 'OTHER';
    openDebtKd: string;
    openInvoiceCount: number;
    openCustomerCount: number;
}
export declare class OpenDebtByIssuerResponseDto {
    rows: OpenDebtByIssuerRowDto[];
    totalOpenDebtKd: string;
    openInvoiceCount: number;
    openCustomerCount: number;
    computedAt: string;
}
