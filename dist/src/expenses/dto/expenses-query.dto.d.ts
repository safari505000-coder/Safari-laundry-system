import { ExpenseStatus } from '@prisma/client';
export declare class ExpensesQueryDto {
    from: string;
    to: string;
    branchId?: string;
    status?: ExpenseStatus;
}
