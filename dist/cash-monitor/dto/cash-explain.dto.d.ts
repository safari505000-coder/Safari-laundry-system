export declare class CashExplainBreakdownEntryDto {
    date: string;
    amount: string;
    count: number;
}
export declare class CashExplainDriverDto {
    driverId: string;
    driverName: string | null;
    branchId: string | null;
    totalCash: string;
    oldestCashAgeHours: number;
    oldestOriginDate: string | null;
    flowCount: number;
    breakdown: CashExplainBreakdownEntryDto[];
}
export declare class CashExplainResponseDto {
    generatedAt: string;
    totalDrivers: number;
    totalCash: string;
    drivers: CashExplainDriverDto[];
    readOnly: true;
    advisoryOnly: true;
}
