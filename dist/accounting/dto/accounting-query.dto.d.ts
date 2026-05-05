export declare enum AccountingScopeType {
    ALL = "ALL",
    BRANCH = "BRANCH",
    DRIVER = "DRIVER"
}
export declare class AccountingReconciliationQueryDto {
    date: string;
    scopeType?: AccountingScopeType;
    branchId?: string;
    driverId?: string;
}
export declare class AccountingTimelineQueryDto {
    scopeType?: AccountingScopeType;
    driverId?: string;
    branchId?: string;
    date: string;
}
