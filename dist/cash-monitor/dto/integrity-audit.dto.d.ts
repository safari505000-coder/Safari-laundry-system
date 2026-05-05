export type IntegrityIssueSeverity = 'CRITICAL' | 'WARNING';
export type IntegrityIssueType = 'STATUS_DRIFT' | 'CRITICAL_COUNT_MISMATCH' | 'WARNING_COUNT_MISMATCH' | 'TOPRISK_INCONSISTENCY' | 'AMOUNT_FLOOR_VIOLATION' | 'AGE_GATE_VIOLATION' | 'DRIVER_AMOUNT_MISMATCH' | 'TOTAL_CASH_DRIFT' | 'DRIVER_LAYER_MISMATCH' | 'ALERT_WITHOUT_DRIVER' | 'TOPRISK_DRIVER_NOT_IN_CLASSIFIED';
export declare class IntegrityIssueDto {
    type: IntegrityIssueType;
    severity: IntegrityIssueSeverity;
    driverId: string | null;
    driverName: string | null;
    expected: string | null;
    found: string | null;
    sourceA: string;
    sourceB: string | null;
    delta: string | null;
    message: string;
}
export declare class IntegrityAuditSummaryDto {
    driversChecked: number;
    alertsChecked: number;
    layersChecked: number;
    mismatches: number;
    warnings: number;
    generatedAt: string;
}
export declare class IntegrityAuditResponseDto {
    status: 'PASS' | 'FAIL';
    blocked: boolean;
    criticalIssues: IntegrityIssueDto[];
    warnings: IntegrityIssueDto[];
    summary: IntegrityAuditSummaryDto;
    readOnly: true;
}
