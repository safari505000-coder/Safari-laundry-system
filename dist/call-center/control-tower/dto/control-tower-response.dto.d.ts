import { ControlTowerPreset } from './control-tower-query.dto';
export type ControlTowerSlaStatusDto = 'OK' | 'LATE' | 'ESCALATED' | 'BREACHED';
export type ControlTowerRiskLevelDto = 'NORMAL' | 'LATE' | 'RISK';
export declare class ControlTowerKpisDto {
    totalDue: number;
    customersWithDebt: number;
    lateCustomers: number;
    riskCustomers: number;
    activeDispatches: number;
    slaBreached: number;
}
export declare class ControlTowerDriverWorkloadDto {
    driverId: string;
    name: string;
    assigned: number;
    inProgress: number;
    late: number;
}
export declare class ControlTowerRowDto {
    customerId: string;
    customerName: string;
    phone: string;
    driverName: string;
    totalDue: number;
    invoicesCount: number;
    daysLate: number;
    riskLevel: ControlTowerRiskLevelDto;
    hasActiveDispatch: boolean;
    dispatchStatus: 'ASSIGNED' | 'IN_PROGRESS' | null;
    slaStatus: ControlTowerSlaStatusDto;
    blocked: boolean;
}
export declare class ControlTowerMetaDto {
    preset: ControlTowerPreset;
    generatedAt: string;
    windowFromIso: string | null;
    windowToIso: string | null;
}
export declare class ControlTowerResponseDto {
    kpis: ControlTowerKpisDto;
    drivers: ControlTowerDriverWorkloadDto[];
    rows: ControlTowerRowDto[];
    meta: ControlTowerMetaDto;
}
