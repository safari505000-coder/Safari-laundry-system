import type { CashV2Stage } from '../../cash-intelligence/dto/cash-intelligence-analysis.dto';
export type ExposureAgingBucket = 'PENDING' | 'OVERDUE' | 'HIGH_RISK' | 'CRITICAL';
export type ExposureRiskLevel = 'NORMAL' | 'WARNING' | 'HIGH_RISK' | 'CRITICAL';
export type ExposureSilentAlertType = 'AMOUNT_THRESHOLD' | 'AGING_THRESHOLD';
export declare class ExposureBatchDto {
    batchId: string;
    amount: string;
    originDate: string;
    ageHours: number;
    ageBucket: ExposureAgingBucket;
    stage: CashV2Stage;
}
export declare class ExposureDriverDto {
    driverId: string;
    driverName: string | null;
    branchId: string | null;
    totalExposure: string;
    batchCount: number;
    oldestPendingAgeHours: number;
    amountRiskLevel: ExposureRiskLevel;
    ageRiskLevel: ExposureRiskLevel;
    riskLevel: ExposureRiskLevel;
    batches: ExposureBatchDto[];
}
export declare class ExposureSilentAlertDto {
    type: ExposureSilentAlertType;
    level: Exclude<ExposureRiskLevel, 'NORMAL'>;
    driverId: string;
    driverName: string | null;
    branchId: string | null;
    totalExposure: string | null;
    ageHours: number | null;
    message: string;
    generatedAt: string;
}
export declare class ExposureSummaryDto {
    totalDrivers: number;
    driversAtWarning: number;
    driversAtHighRisk: number;
    driversAtCritical: number;
    totalExposure: string;
}
export declare class CashExposureResponseDto {
    generatedAt: string;
    summary: ExposureSummaryDto;
    drivers: ExposureDriverDto[];
    silentAlerts: ExposureSilentAlertDto[];
    readOnly: true;
    advisoryOnly: true;
    audience: 'ACCOUNTANT_AND_EXECUTIVE';
}
export declare const EXPOSURE_THRESHOLDS: {
    readonly amount: {
        readonly warningKd: 200;
        readonly criticalKd: 500;
    };
    readonly ageHours: {
        readonly overdue: 24;
        readonly highRisk: 48;
        readonly critical: 72;
    };
};
