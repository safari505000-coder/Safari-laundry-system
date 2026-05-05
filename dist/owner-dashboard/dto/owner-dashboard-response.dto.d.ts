export type OwnerDashboardStatus = 'healthy' | 'warning' | 'critical';
export type OwnerDashboardCacheStatus = 'loading' | 'ready' | 'stale';
export declare class OwnerDashboardPaymentsDto {
    successRate: number;
    successCount: number;
    failureCount: number;
}
export declare class OwnerDashboardOrdersDto {
    today: number;
    active: number;
}
export declare class OwnerDashboardQueuesDto {
    waiting: number;
    failed: number;
}
export declare class OwnerDashboardAlertsDto {
    active: number;
    lastMessage?: string;
}
export declare class OwnerDashboardResponseDto {
    systemStatus: OwnerDashboardStatus;
    revenueToday: number;
    revenueThisMonth: number;
    payments: OwnerDashboardPaymentsDto;
    orders: OwnerDashboardOrdersDto;
    queues: OwnerDashboardQueuesDto;
    alerts: OwnerDashboardAlertsDto;
}
export declare class OwnerDashboardCacheResponseDto {
    status: OwnerDashboardCacheStatus;
    data: OwnerDashboardResponseDto | null;
    lastUpdated: string | null;
}
