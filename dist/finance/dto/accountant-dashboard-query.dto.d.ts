export declare enum AccountantDashboardPeriod {
    TODAY = "today",
    WEEK = "week",
    MONTH = "month"
}
export declare class AccountantDashboardQueryDto {
    period: AccountantDashboardPeriod;
    branchId?: string;
}
