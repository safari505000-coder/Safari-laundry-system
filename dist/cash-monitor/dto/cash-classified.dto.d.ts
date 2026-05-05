import { SafariRole } from "@prisma/client";
export type ClassifiedTrafficLight = 'GREEN' | 'YELLOW' | 'RED';
export type ClassifiedDriverStatus = 'NORMAL' | 'COMPLIANCE_ONLY' | 'AT_RISK';
export type ClassifiedAlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type ClassifiedDomain = 'FINANCIAL' | 'COMPLIANCE';
export declare class ClassifiedAlertDto {
    domain: ClassifiedDomain;
    type: string;
    severity: ClassifiedAlertSeverity;
    driverId: string | null;
    driverName: string | null;
    branchId: string | null;
    amount: string;
    cashAgeHours: number;
    reason: string;
    originalType: string | null;
}
export declare class ClassifiedDriverDto {
    driverId: string;
    driverName: string | null;
    branchId: string | null;
    holderRole: SafariRole | null;
    status: ClassifiedDriverStatus;
    cashAgeHours: number;
    amount: string;
    shiftDurationHours: number | null;
    note: string;
}
export declare class ClassifiedRulesDto {
    gracePeriodHours: number;
    smallAmountFloorKd: number;
    financialChainTypes: string[];
    complianceTypes: string[];
    shiftFinancialSeverityCap: ClassifiedAlertSeverity;
    generatedAt: string;
}
export declare class CashClassifiedResponseDto {
    systemStatus: ClassifiedTrafficLight;
    financialAlerts: ClassifiedAlertDto[];
    complianceAlerts: ClassifiedAlertDto[];
    drivers: ClassifiedDriverDto[];
    finalDecision: string;
    rules: ClassifiedRulesDto;
    readOnly: true;
    advisoryOnly: true;
}
