import { CommissionCalculationBase, CommissionMode, CommissionPayoutTiming, SafariRole } from "@prisma/client";
export declare class CreateCommissionRuleDto {
    name: string;
    isActive?: boolean;
    role?: SafariRole | null;
    mode: CommissionMode;
    calculationBase?: CommissionCalculationBase;
    percentage: number;
    minInvoiceAmount?: number;
    payoutTiming?: CommissionPayoutTiming;
    linkedToDebt?: boolean;
}
