export type GuardianSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type GuardianRunStatus = 'OK' | 'ISSUES_FOUND';
export type GuardianCheckId = 'CASH_INTEGRITY' | 'REGRESSION_GUARD' | 'DRIVER_CONSISTENCY' | 'FLOW_CHAIN' | 'API_HEALTH' | 'QUEUE_HEALTH' | 'UI_CONSISTENCY';
export declare class GuardianIssueDto {
    id: string;
    severity: GuardianSeverity;
    check: GuardianCheckId;
    message: string;
    driverId: string | null;
    driverName: string | null;
    expected: string | null;
    found: string | null;
    delta: string | null;
    context: Record<string, string> | null;
    firstSeenAt: string;
    lastSeenAt: string;
    occurrences: number;
}
export declare class GuardianHealthSnapshotDto {
    classified: string | null;
    risk: string | null;
    executive: string | null;
    classifiedLatencyMs: number | null;
    riskLatencyMs: number | null;
    executiveLatencyMs: number | null;
}
export declare class GuardianAlertHistoryEntryDto {
    timestamp: string;
    status: GuardianRunStatus;
    severity: GuardianSeverity;
    issuesCount: number;
    sentToWhatsApp: boolean;
    whatsAppError: string | null;
}
export declare class GuardianResponseDto {
    status: GuardianRunStatus;
    severity: GuardianSeverity;
    issues: GuardianIssueDto[];
    health: GuardianHealthSnapshotDto;
    sentToWhatsApp: boolean;
    whatsAppError: string | null;
    timestamp: string;
    durationMs: number;
    readOnly: true;
}
export declare class GuardianStatusResponseDto extends GuardianResponseDto {
    history: GuardianAlertHistoryEntryDto[];
    whatsAppConfigured: boolean;
    ownerPhoneMasked: string | null;
    ownerPhoneSource: 'database' | 'env' | 'none';
}
