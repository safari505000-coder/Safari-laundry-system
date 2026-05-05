export type DriverAmountRootCause = 'CLASSIFICATION_DRIFT' | 'SNAPSHOT_DRIFT' | 'FILTERING_BUG' | 'EXECUTIVE_PROJECTION_BUG' | 'PARTIAL_DATA_OR_STALE_CACHE' | 'MIXED_DRIFT';
export declare class DriverAmountSnapshotDto {
    classified: string | null;
    risk: string | null;
    live: string | null;
    operational: string | null;
    executive: string | null;
}
export declare class DriverAmountPresenceDto {
    classified: boolean;
    risk: boolean;
    live: boolean;
    operational: boolean;
    executive: boolean;
}
export declare class DriverAmountMismatchDto {
    driverId: string;
    driverName: string | null;
    amounts: DriverAmountSnapshotDto;
    presence: DriverAmountPresenceDto;
    difference: string;
    minAmount: string;
    maxAmount: string;
    severity: 'CRITICAL' | 'WARNING';
    rootCause: DriverAmountRootCause;
    reasons: string[];
}
export declare class DriverAmountAuditSummaryDto {
    totalMismatches: number;
    criticalDrivers: number;
    layersChecked: number;
}
export declare class DriverAmountAuditResponseDto {
    status: 'PASS' | 'FAIL';
    totalDrivers: number;
    mismatches: DriverAmountMismatchDto[];
    matched: DriverAmountMismatchDto[];
    summary: DriverAmountAuditSummaryDto;
    generatedAt: string;
    readOnly: true;
}
