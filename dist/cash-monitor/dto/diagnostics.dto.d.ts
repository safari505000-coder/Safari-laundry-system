export type DiagnosticRootCause = 'SNAPSHOT_DRIFT' | 'CLASSIFICATION_MISMATCH' | 'CACHE_STALE' | 'MAPPING_ERROR' | 'AGGREGATION_BUG' | 'AMOUNT_FLOOR_VIOLATION' | 'AGE_GATE_VIOLATION' | 'UNKNOWN';
export type DiagnosticSource = 'GUARDIAN' | 'INTEGRITY_AUDIT' | 'DRIVER_AMOUNT_AUDIT';
export type DiagnosticSeverity = 'CRITICAL' | 'WARNING';
export declare class DiagnosticValuesDto {
    classified: string | null;
    risk: string | null;
    executive: string | null;
    live: string | null;
    operational: string | null;
}
export declare class DiagnosticItemDto {
    id: string;
    source: DiagnosticSource;
    issueType: string;
    driverId: string | null;
    driverName: string | null;
    severity: DiagnosticSeverity;
    values: DiagnosticValuesDto;
    delta: string;
    rootCause: DiagnosticRootCause;
    explanationAr: string;
    action: string;
    timestamp: string;
    formatted: string;
}
export declare class DiagnosticsSummaryDto {
    total: number;
    critical: number;
    warning: number;
    uniqueRootCauses: number;
}
export declare class DiagnosticsResponseDto {
    items: DiagnosticItemDto[];
    summary: DiagnosticsSummaryDto;
    generatedAt: string;
    readOnly: true;
}
