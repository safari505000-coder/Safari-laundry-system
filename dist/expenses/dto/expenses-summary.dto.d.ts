import { ExpenseCategory } from "@prisma/client";
export declare class ExpensesSummaryQueryDto {
    from: string;
    to: string;
    branchId?: string;
}
export type ExpenseOwnerType = 'BRANCH' | 'DRIVER' | 'COMPANY';
export declare class ExpensesSummaryByOwnerDto {
    ownerType: ExpenseOwnerType;
    totalKd: string;
    count: number;
}
export declare class ExpensesSummaryByCategoryDto {
    category: ExpenseCategory;
    totalKd: string;
    count: number;
}
export declare class ExpensesSummaryByBranchDto {
    branchId: string | null;
    branchName: string | null;
    totalKd: string;
    count: number;
}
export declare class ExpensesSummaryMonthlyDto {
    month: string;
    totalKd: string;
    driverKd: string;
    branchKd: string;
    companyKd: string;
}
export declare class ExpensesSummaryAlertDto {
    id: string;
    severity: 'info' | 'warning' | 'critical';
    message: string;
}
export declare class ExpensesSummaryResponseDto {
    source: 'api/finance/expenses-summary';
    rangeFromIso: string;
    rangeToIso: string;
    branchScope: string | null;
    totalApprovedKd: string;
    totalPendingKd: string;
    approvedCount: number;
    byOwnerType: ExpensesSummaryByOwnerDto[];
    byCategory: ExpensesSummaryByCategoryDto[];
    byBranch: ExpensesSummaryByBranchDto[];
    monthly: ExpensesSummaryMonthlyDto[];
    alerts: ExpensesSummaryAlertDto[];
}
