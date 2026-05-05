export type CashV2Health = 'OK' | 'WARNING' | 'CRITICAL';
export type CashV2Severity = 'INFO' | 'WARNING' | 'CRITICAL' | 'CRITICAL_ESCALATED';
export type CashV2DriverGate = 'NO_ACTIVITY_TODAY' | 'HISTORICAL_BALANCE' | 'ACTIVE_FLOW' | 'SHIFT_OVERDUE';
export type CashV2AmountTier = 'SMALL' | 'MEDIUM' | 'LARGE';
export type CashV2Stage = 'DRIVER' | 'DRIVER_HANDOVER' | 'CUSTODY' | 'VERIFIED' | 'DEPOSIT' | 'BANK';
export type CashV2AnomalyType = 'SHIFT_OVERDUE' | 'STUCK_AT_DRIVER' | 'HANDOVER_DELAY' | 'CUSTODY_DELAY' | 'DEPOSIT_NOT_REGISTERED' | 'DEPOSIT_AMOUNT_MISMATCH' | 'DOUBLE_COUNT_RISK' | 'OVERPAYMENT_ANOMALY' | 'SUBSCRIPTION_LEAKAGE';
export type CashV2Responsible = 'DRIVER' | 'BRANCH_MANAGER' | 'ACCOUNTANT' | 'SYSTEM';
export declare class CashV2ExecutionSummaryDto {
    dataFetched: string[];
    logicApplied: string[];
    ignoredCases: string[];
    assumptions: string[];
    toleranceKd: string;
    shiftOverdueCapHours: number;
    asOfDate: string;
    generatedAt: string;
}
export declare class CashV2SummaryDto {
    totalCash: string;
    newCash: string;
    agedCash: string;
    issues: number;
}
export declare class CashV2LocationSummaryDto {
    DRIVER: string;
    CUSTODY: string;
    BANK: string;
}
export declare class CashV2FlowDto {
    driverId: string;
    driverName: string | null;
    branchId: string | null;
    amount: string;
    amountTier: CashV2AmountTier;
    originDate: string;
    ageDays: number;
    ageHours: number;
    stage: CashV2Stage;
    driverGate: CashV2DriverGate;
    shiftStatus: 'OPEN' | 'CLOSED' | 'NO_SHIFT';
    shiftDurationHours: number | null;
    ignoredNonOperational: boolean;
    contextReason: string;
}
export declare class CashV2AnomalyDto {
    type: CashV2AnomalyType;
    severity: CashV2Severity;
    amount: string;
    amountTier: CashV2AmountTier;
    ageDays: number;
    stage: CashV2Stage;
    responsible: CashV2Responsible;
    driverId: string | null;
    branchId: string | null;
    reason: string;
    actionLocked: boolean;
    requiresManualReview: boolean;
}
export declare class CashIntelligenceAnalysisDto {
    executionSummary: CashV2ExecutionSummaryDto;
    systemHealth: CashV2Health;
    summary: CashV2SummaryDto;
    locationSummary: CashV2LocationSummaryDto;
    flows: CashV2FlowDto[];
    anomalies: CashV2AnomalyDto[];
    finalAssessment: string;
    readOnly: true;
    advisoryOnly: true;
}
