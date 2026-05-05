import { MonitorAlertSeverity, MonitorTrafficLight } from './cash-monitor.dto';
export type OperationalAlertType = 'SHIFT_COMPLIANCE_DELAY' | 'SHIFT_OVERDUE_FINANCIAL' | 'PRE_SHIFT_OVERDUE' | 'HIGH_DRIVER_EXPOSURE' | 'STUCK_AT_DRIVER' | 'HANDOVER_DELAY' | 'CUSTODY_DELAY' | 'DEPOSIT_NOT_REGISTERED' | 'DEPOSIT_AMOUNT_MISMATCH' | 'OVERPAYMENT_ANOMALY' | 'DOUBLE_COUNT_RISK';
export type OperationalDriverStatus = 'ACTIVE' | 'AT_RISK' | 'EXPOSURE_ONLY' | 'STALE';
export declare class ActiveDriverDto {
    driverId: string;
    driverName: string | null;
    branchId: string | null;
    ordersTodayCount: number;
    collectedCashToday: string;
    totalCash: string;
    lastCashActivityDate: string | null;
    shiftStatus: 'OPEN' | 'CLOSED' | 'NO_SHIFT';
    shiftDurationHours: number | null;
    countdownMinutes: number | null;
    status: OperationalDriverStatus;
}
export declare class OperationalAlertDto {
    type: OperationalAlertType;
    domain: 'FINANCIAL' | 'COMPLIANCE';
    severity: MonitorAlertSeverity;
    driverId: string | null;
    driverName: string | null;
    branchId: string | null;
    amount: string;
    message: string;
    timestamp: string;
    countdownMinutes: number | null;
    isPrediction: boolean;
    originalType: string | null;
}
export declare class OperationalHiddenDto {
    staleDriversCount: number;
    excludedAlertCount: number;
    note: string;
}
export declare class OperationalSummaryDto {
    totalDriversShown: number;
    totalCash: string;
    driversAtRisk: number;
    activeAlerts: number;
}
export declare class OperationalLiveDto {
    timestamp: string;
    realtimeStatus: MonitorTrafficLight;
    activeDrivers: ActiveDriverDto[];
    driversAtRisk: ActiveDriverDto[];
    alerts: OperationalAlertDto[];
    hidden: OperationalHiddenDto;
    summary: OperationalSummaryDto;
    readOnly: true;
    advisoryOnly: true;
}
