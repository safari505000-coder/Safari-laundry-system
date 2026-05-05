import { CashExecutionBlockDto } from './cash-execution.dto';
import { ExposureSilentAlertDto } from './cash-exposure.dto';
export type ExecutiveResponsible = 'DRIVER' | 'BRANCH_MANAGER' | 'ACCOUNTANT' | 'SYSTEM' | null;
export type ExecutiveStatus = 'GREEN' | 'YELLOW' | 'RED';
export type ExecutiveUrgency = 'HIGH' | 'MEDIUM' | 'LOW';
export declare class ExecutiveTopRiskDto {
    driverId: string | null;
    driverName: string | null;
    branchId: string | null;
    amount: string;
    issue: string;
    action: string;
    urgency: ExecutiveUrgency;
    responsible: ExecutiveResponsible;
    recommendedSteps: string[];
    alertType: string;
    execution: CashExecutionBlockDto | null;
}
export declare class ExecutiveActionDto {
    driverName: string | null;
    action: string;
    urgency: ExecutiveUrgency;
    responsible: ExecutiveResponsible;
    amount: string;
    alertType: string;
}
export declare class ExecutiveSummaryDto {
    activeDrivers: number;
    driversAtRisk: number;
    criticalAlerts: number;
    warningAlerts: number;
}
export declare class ExecutiveAuditReferenceDto {
    totalAlerts: number;
    hiddenStaleDrivers: number;
    totalCashInFlight: string;
    lastPollAt: string | null;
}
export declare class CashExecutiveResponseDto {
    systemStatus: ExecutiveStatus;
    generatedAt: string;
    topRisk: ExecutiveTopRiskDto | null;
    actions: ExecutiveActionDto[];
    summary: ExecutiveSummaryDto;
    auditReference: ExecutiveAuditReferenceDto;
    decisionNote: string;
    silentAlerts: ExposureSilentAlertDto[] | null;
    readOnly: true;
    advisoryOnly: true;
}
