import { ExpenseCategory } from '@prisma/client';
export declare class CreateExpenseDto {
    title: string;
    amount: number;
    category: ExpenseCategory;
    note?: string;
    receiptImageData?: string;
}
