export declare class DailyCollectionsReconciliationQueryDto {
    date?: string;
}
export type ReconciliationStatus = 'MATCH' | 'DRIFT';
export declare class ReconciliationCheckDto {
    id: string;
    status: ReconciliationStatus;
    transactionHistoryKd: string;
    generalLedgerKd: string;
    deltaKd: string;
    note: string;
}
export declare class DailyCollectionsReconciliationResponseDto {
    dayIsoLocal: string;
    dayStartIso: string;
    dayEndIso: string;
    overallStatus: ReconciliationStatus;
    checks: ReconciliationCheckDto[];
    totals: {
        transactionHistory: {
            collectedKd: string;
            discountKd: string;
        };
        generalLedger: {
            collectedKd: string;
            discountKd: string;
        };
    };
    generatedAtIso: string;
}
