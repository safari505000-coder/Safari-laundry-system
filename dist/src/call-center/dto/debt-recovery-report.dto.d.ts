export declare class DebtRecoveryQueryDto {
    from?: string;
    to?: string;
}
export declare class DebtRecoveryDayRowDto {
    dayIso: string;
    recoveredKd: string;
    settlementCount: number;
    subscriptionCount: number;
}
export declare class DebtRecoveryReportDto {
    from: string;
    to: string;
    totalRecoveredKd: string;
    days: DebtRecoveryDayRowDto[];
}
