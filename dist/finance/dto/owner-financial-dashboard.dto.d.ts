export type FinancialAlertType = 'HIGH_DEBT' | 'DRIVER_DELAY' | 'EXPENSE_SPIKE' | 'CASH_MISMATCH';
export type FinancialAlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type DriverRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'WARNING';
export type CustomerHealth = 'GOOD' | 'WATCH' | 'RISK' | 'BLOCKED';
export declare class FinancialAlertDto {
    type: FinancialAlertType;
    severity: FinancialAlertSeverity;
    entityId: string;
    message: string;
    createdAt: string;
}
export declare class OwnerTopCustomerDto {
    customerId: string;
    displayName: string | null;
    totalDueKd: string;
    totalInvoicesKd: string;
    totalPaymentsKd: string;
    customerHealth: CustomerHealth;
    paymentConsistency: number;
    avgPaymentDelayHours: number;
    lifetimeValueKd: string;
}
export declare class RiskyDriverDto {
    driverId: string;
    driverName: string | null;
    collectedCash: string;
    handedCash: string;
    delayHours: number;
    riskLevel: DriverRiskLevel;
}
export declare class OwnerFinancialDashboardDto {
    generatedAt: string;
    totalInvoicesToday: string;
    totalPaymentsToday: string;
    totalDueTotal: string;
    cashInDrivers: string;
    cashInOffice: string;
    reconciliationDifference: string;
    alerts: FinancialAlertDto[];
    topCustomers: OwnerTopCustomerDto[];
    riskyDrivers: RiskyDriverDto[];
}
