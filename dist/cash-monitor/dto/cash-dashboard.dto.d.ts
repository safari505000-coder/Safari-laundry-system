import { ClassifiedAlertDto, ClassifiedDriverStatus, ClassifiedTrafficLight } from './cash-classified.dto';
import { ExecutiveTopRiskDto } from './cash-executive.dto';
export declare class CashDashboardAlertsDto {
    financial: ClassifiedAlertDto[];
    compliance: ClassifiedAlertDto[];
}
export declare class CashDashboardDriverDto {
    driverId: string;
    name: string;
    totalCash: string;
    status: ClassifiedDriverStatus;
    oldestAgeHours: number;
}
export declare class CashDashboardBranchDto {
    branchId: string;
    name: string;
    currentBranchCash: string;
    openBagCount: number;
}
export declare class CashDashboardBranchSummaryDto {
    rows: CashDashboardBranchDto[];
    totalCurrentBranchCash: string;
    unattributedCustodyKd: string;
    unattributedCustodyBagCount: number;
}
export declare class CashDashboardResponseDto {
    systemStatus: ClassifiedTrafficLight;
    totalCash: string;
    summaryText: string;
    alerts: CashDashboardAlertsDto;
    drivers: CashDashboardDriverDto[];
    branches: CashDashboardBranchSummaryDto;
    topRisk: ExecutiveTopRiskDto | null;
    generatedAt: string;
    readOnly: true;
    advisoryOnly: true;
}
