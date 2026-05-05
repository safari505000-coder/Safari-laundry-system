export type DispatchSeverity = 'ON_TIME' | 'LATE' | 'CRITICAL' | 'COMPLETED';
export declare class DispatchRowDto {
    id: string;
    status: 'ASSIGNED' | 'COMPLETED';
    severity: DispatchSeverity;
    elapsedMinutes: number;
    customerId: string;
    customerDisplay: string;
    customerPhone: string;
    driverId: string;
    driverName: string;
    instructionNote: string | null;
    createdAtIso: string;
    completedAtIso: string | null;
    completedByOrderId: string | null;
}
export declare class DispatchSnapshotDto {
    generatedAtIso: string;
    rows: DispatchRowDto[];
}
