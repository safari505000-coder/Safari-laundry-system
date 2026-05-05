export type DecisionUrgency = 'HIGH' | 'MEDIUM' | 'LOW';
export type DecisionActionVerb = 'CONTACT_DRIVER_IMMEDIATELY' | 'CLOSE_SHIFT' | 'ALERT_DRIVER_BEFORE_OVERDUE' | 'REQUEST_PARTIAL_HANDOVER' | 'ESCALATE_TO_BRANCH_MANAGER' | 'ESCALATE_TO_ACCOUNTANT' | 'MANUAL_RECONCILIATION_REQUIRED' | 'INVESTIGATE_DOUBLE_COUNT' | 'REVIEW_SUBSCRIPTION_BILLING' | 'NO_ACTION';
export declare class DecisionActionDto {
    driverId: string | null;
    driverName: string | null;
    branchId: string | null;
    alertType: string;
    domain: 'FINANCIAL' | 'COMPLIANCE';
    amount: string;
    action: DecisionActionVerb;
    reason: string;
    urgency: DecisionUrgency;
    recommendedSteps: string[];
    timestamp: string;
}
export declare class DecisionTopRiskDto {
    driverId: string | null;
    driverName: string | null;
    branchId: string | null;
    amount: string;
    issue: string;
    action: DecisionActionVerb;
    urgency: DecisionUrgency;
    recommendedSteps: string[];
    alertType: string;
}
export declare class DecisionSummaryDto {
    critical: number;
    warning: number;
    info: number;
    totalActions: number;
}
export declare class CashDecisionsResponseDto {
    timestamp: string;
    realtimeStatus: 'GREEN' | 'YELLOW' | 'RED';
    topRisk: DecisionTopRiskDto | null;
    actions: DecisionActionDto[];
    summary: DecisionSummaryDto;
    readOnly: true;
    advisoryOnly: true;
}
