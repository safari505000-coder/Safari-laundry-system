import { DispatchRowDto } from './dispatch-row.dto';
export declare class DispatchMonitorDriverDto {
    driverId: string;
    driverName: string;
    activeAssignedCount: number;
    lateCount: number;
    breachCount: number;
    assignedTasks: DispatchRowDto[];
}
export declare class DispatchMonitorSnapshotDto {
    generatedAtIso: string;
    drivers: DispatchMonitorDriverDto[];
    delayedDriversSection: DispatchRowDto[];
}
