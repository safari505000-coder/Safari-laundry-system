import { ExpenseCategory, ExpenseMethod } from "@prisma/client";
export declare class CreateExpenseDto {
    title: string;
    amount: number;
    category: ExpenseCategory;
    expenseMethod?: ExpenseMethod;
    note?: string;
    receiptUrl?: string;
}
