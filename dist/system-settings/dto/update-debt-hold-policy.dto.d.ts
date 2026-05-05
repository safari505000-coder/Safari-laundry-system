import { DebtHoldMode } from "@prisma/client";
export declare class UpdateDebtHoldPolicyDto {
    isActive: boolean;
    holdMode: DebtHoldMode;
    fixedAmount?: number;
}
