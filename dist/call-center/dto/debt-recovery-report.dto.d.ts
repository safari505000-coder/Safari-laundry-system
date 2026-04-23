export declare class DebtRecoveryQueryDto {
    from?: string;
    to?: string;
}
export declare class DebtRecoveryDayRowDto {
    dayIso: string;
    recoveredKd: string;
    recoveredCashKd: string;
    recoveredElectronicKd: string;
    recoveredWalletKd: string;
    settlementCount: number;
    subscriptionCount: number;
}
export declare class DebtRecoveryReportDto {
    from: string;
    to: string;
    totalRecoveredKd: string;
    totalRecoveredCashKd: string;
    totalRecoveredElectronicKd: string;
    totalRecoveredWalletKd: string;
    days: DebtRecoveryDayRowDto[];
}
