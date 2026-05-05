export type CashReconciliationStatus = 'OK' | 'MISMATCH' | 'CRITICAL';
export type CashResponsibleParty = 'DRIVER' | 'BRANCH' | 'ACCOUNTING';
export type CashSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type CashTimelineEventType = 'ORDER_COLLECTED' | 'DRIVER_HANDOVER' | 'MANAGER_CONFIRMED' | 'BANK_DEPOSITED';
export declare class CashResponsibilityDto {
    responsible: CashResponsibleParty;
    amount: string;
    delayHours: number;
    severity: CashSeverity;
}
export declare class CashDriverBreakdownDto {
    driverId: string;
    driverName: string | null;
    collected: string;
    handed: string;
    difference: string;
    status: CashReconciliationStatus;
}
export declare class CashControlAlertDto {
    type: 'MISSING_HANDOVER' | 'DELAYED_DEPOSIT' | 'PARTIAL_DEPOSIT' | 'DEPOSIT_NOT_REGISTERED';
    severity: CashSeverity;
    entityId: string;
    message: string;
}
export declare class CashFlowControlDto {
    custodyId: string;
    shiftId: string | null;
    custodyAmount: string;
    linkedOrdersTotal: string;
    depositId: string | null;
    depositStatus: 'MISSING' | 'PENDING' | 'VERIFIED' | 'AMOUNT_MISMATCH';
    auditComplete: boolean;
    anomalyFlags: string[];
}
export declare class CashReconciliationDto {
    date: string;
    branchId: string | null;
    expectedCash: string;
    collectedByDrivers: string;
    handedToBranch: string;
    receivedByManager: string;
    depositedToBank: string;
    differenceDriver: string;
    differenceBranch: string;
    differenceBank: string;
    totalDifference: string;
    status: CashReconciliationStatus;
    breakdown: CashDriverBreakdownDto[];
    accountability: CashResponsibilityDto[];
    alerts: CashControlAlertDto[];
    depositStatus: 'MISSING' | 'PENDING' | 'VERIFIED' | 'MIXED';
    auditComplete: boolean;
    flows: CashFlowControlDto[];
    reconciliationMode: 'flow_based';
    ignoredTimingMismatch: boolean;
    actionsTaken: string[];
}
export declare class CashTimelineEventDto {
    type: CashTimelineEventType;
    timestamp: string;
    amount: string;
    userId: string | null;
    sourceId: string;
}
export declare class CashTimelineResponseDto {
    events: CashTimelineEventDto[];
}
