export declare class DebtKdBreakdownTraceDto {
    ledgerNetKd: string;
    walletSnapshotKd: string;
    orderMarketScopeKd: string;
    operationalDebtKd: string;
    effectiveDebtKd: string;
    winningSources: Array<'ledger' | 'walletSnapshot' | 'orderMarket'>;
}
export declare class DebtConversionPlanOptionDto {
    planId: string;
    planName: string;
    planValidityDays: number;
    cashRequiredKd: string;
    planActualBalanceKd: string;
    debtToSettleKd: string;
    remainingDebtKd: string;
    creditedToBalanceKd: string;
    projectedWalletBalanceKd: string;
    projectedWalletDebtKd: string;
    subsidyKd: string;
    convertsDebt: boolean;
    clearsAllDebt: boolean;
    recommended: boolean;
}
export declare class DebtConversionOptionsResponseDto {
    customerId: string;
    currentDebtKd: string;
    currentBalanceKd: string;
    hasDebt: boolean;
    debtKdBreakdownTrace?: DebtKdBreakdownTraceDto;
    options: DebtConversionPlanOptionDto[];
}
