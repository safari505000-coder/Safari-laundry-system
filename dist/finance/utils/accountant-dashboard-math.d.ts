export declare const RECONCILIATION_BALANCE_EPS = 0.0001;
export type ReconciliationDisplayStatus = 'GREEN' | 'RED' | 'YELLOW';
export declare function reconciliationDeltaKds(collectedKd: number, handedKd: number): {
    deltaKd: string;
    shortfallKd: string;
    status: ReconciliationDisplayStatus;
};
export declare function reconciliationBadgeFromDiff(diff: number): 'green' | 'yellow' | 'red';
export declare function kpiTrendDirection(curr: number, prev: number): {
    direction: 'up' | 'down' | 'flat';
    pctVsPrevious: number;
};
