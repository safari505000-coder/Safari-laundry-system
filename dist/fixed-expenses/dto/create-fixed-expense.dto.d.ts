import { FixedExpenseCategory } from "@prisma/client";
export declare class CreateFixedExpenseDto {
    branchId: string;
    title: string;
    category: FixedExpenseCategory;
    monthlyAmount: number;
    effectiveFrom?: string;
    effectiveTo?: string | null;
}
