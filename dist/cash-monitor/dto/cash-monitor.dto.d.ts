export type MonitorAlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type MonitorAlertType = 'PRE_SHIFT_OVERDUE' | 'HIGH_DRIVER_EXPOSURE' | 'NEW_FLOW' | 'FLOW_UPDATED' | 'STAGE_CHANGED' | 'NEW_ANOMALY' | 'SEVERITY_ESCALATED' | 'SHIFT_OVERDUE' | 'STUCK_AT_DRIVER' | 'HANDOVER_DELAY' | 'CUSTODY_DELAY' | 'DEPOSIT_NOT_REGISTERED' | 'DEPOSIT_AMOUNT_MISMATCH' | 'DOUBLE_COUNT_RISK' | 'OVERPAYMENT_ANOMALY' | 'SUBSCRIPTION_LEAKAGE';
export type MonitorTrafficLight = 'GREEN' | 'YELLOW' | 'RED';
export declare class MonitorAlertDto {
    type: MonitorAlertType;
    severity: MonitorAlertSeverity;
    driverId: string | null;
    driverName: string | null;
    branchId: string | null;
    amount: string;
    message: string;
    timestamp: string;
    countdownMinutes: number | null;
    isPrediction: boolean;
    dedupKey: string | null;
}
export declare class MonitorDriverExposureDto {
    driverId: string;
    driverName: string | null;
    branchId: string | null;
    totalCash: string;
    flowsCount: number;
    shiftStatus: 'OPEN' | 'CLOSED' | 'NO_SHIFT';
    shiftDurationHours: number | null;
    countdownMinutes: number | null;
}
export declare class MonitorLocationSummaryDto {
    DRIVER: string;
    CUSTODY: string;
    BANK: string;
}
export declare class MonitorSummaryDto {
    totalCash: string;
    driversAtRisk: number;
    activeAnomalies: number;
    openShifts: number;
}
export declare class CashMonitorLiveDto {
    timestamp: string;
    lastPollAt: string | null;
    lastPollAgeSeconds: number | null;
    realtimeStatus: MonitorTrafficLight;
    activeDrivers: number;
    preRisk: MonitorAlertDto[];
    alerts: MonitorAlertDto[];
    driversAtRisk: MonitorDriverExposureDto[];
    locationSummary: MonitorLocationSummaryDto;
    summary: MonitorSummaryDto;
    readOnly: true;
    advisoryOnly: true;
}
