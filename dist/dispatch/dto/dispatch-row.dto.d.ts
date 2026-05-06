export type DispatchSeverity = 'ON_TIME' | 'LATE' | 'CRITICAL' | 'COMPLETED';
export type DispatchSlaTone = 'NORMAL' | 'LATE' | 'BREACH';
export declare class DispatchRowDto {
    id: string;
    status: 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
    severity: DispatchSeverity;
    elapsedMinutes: number;
    customerId: string;
    customerDisplay: string;
    customerPhone: string;
    driverId: string;
    driverName: string;
    instructionNote: string | null;
    createdAtIso: string;
    acknowledgedAtIso: string | null;
    completedAtIso: string | null;
    completedByOrderId: string | null;
    startedAtIso: string | null;
    firstAlertAtIso: string | null;
    escalatedAtIso: string | null;
    breachedAtIso: string | null;
    ackMinutes: number | null;
    totalMinutes: number | null;
    slaTone: DispatchSlaTone;
}
export declare class DispatchSnapshotDto {
    generatedAtIso: string;
    rows: DispatchRowDto[];
}
