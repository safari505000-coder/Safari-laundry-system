import { CashV2AnomalyType, CashV2Responsible } from '../../cash-intelligence/dto/cash-intelligence-analysis.dto';
export type RiskTrafficLight = 'GREEN' | 'YELLOW' | 'RED';
export type RiskDriverStatus = 'NORMAL' | 'WARNING' | 'RISK' | 'CRITICAL';
export type RiskClassification = 'NEW_CASH' | 'AGED' | 'SHIFT_COMPLIANCE_ONLY';
export declare class CashRiskBreakdownDto {
    amount: string;
    ageDays: number;
    ageHours: number;
    score: number;
    classification: RiskClassification;
    stage: string;
}
export declare class CashRiskDriverDto {
    driverId: string;
    driverName: string | null;
    branchId: string | null;
    totalCash: string;
    driverScore: number;
    status: RiskDriverStatus;
    breakdown: CashRiskBreakdownDto[];
    lateCountLast7Days: number;
    behaviorMultiplier: number;
    shiftDurationHours: number | null;
    shiftComplianceOnly: boolean;
    action: string;
    responsible: CashV2Responsible | null;
}
export declare class CashRiskAnomalyDto {
    type: CashV2AnomalyType;
    driverId: string;
    driverName: string | null;
    branchId: string | null;
    amount: string;
    ageDays: number;
    ageHours: number;
    responsible: CashV2Responsible;
    reason: string;
}
export declare class CashRiskSummaryDto {
    totalCash: string;
    totalDrivers: number;
    driversAtRisk: number;
    agedCash: string;
    newCash: string;
}
export declare class CashRiskExecutionExplanationDto {
    gracePeriodHours: number;
    severityBands: {
        warning: number;
        risk: number;
        critical: number;
    };
    amountTiers: {
        small: number;
        large: number;
    };
    shiftOverdueCapHours: number;
    generatedAt: string;
}
export declare class CashRiskResponseDto {
    systemStatus: RiskTrafficLight;
    summary: CashRiskSummaryDto;
    drivers: CashRiskDriverDto[];
    anomalies: CashRiskAnomalyDto[];
    executionSummary: CashRiskExecutionExplanationDto;
    readOnly: true;
    advisoryOnly: true;
}
