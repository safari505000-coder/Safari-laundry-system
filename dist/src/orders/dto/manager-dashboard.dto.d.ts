export declare class DriverContributionDto {
    driverId: string;
    employeeId: string | null;
    username: string;
    fullName: string;
    completedOrderCount: number;
    completedRevenue: string;
}
export declare class ManagerDashboardDto {
    totalActiveOrders: number;
    revenueCompletedOrders: string;
    driverContribution: DriverContributionDto[];
}
