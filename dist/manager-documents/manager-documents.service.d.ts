import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
export type ManagerDocumentKind = 'CUSTODY_RECEIPT' | 'EXPENSE_VOUCHER';
export type ManagerDocumentRow = {
    kind: ManagerDocumentKind;
    id: string;
    date: string;
    amountKd: string;
    title: string;
    subtitle: string | null;
    status: string;
    printPath: string;
};
export declare class ManagerDocumentsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    listForManager(managerId: string, branchId: string | null): Promise<ManagerDocumentRow[]>;
    getExpenseVoucherForManager(expenseId: string, managerId: string, branchId: string | null): Promise<({
        recordedBy: {
            id: string;
            username: string;
            fullName: string;
        };
        branch: {
            id: string;
            name: string;
        } | null;
    } & {
        id: string;
        title: string;
        amount: Prisma.Decimal;
        category: import("@prisma/client").$Enums.ExpenseCategory;
        expenseMethod: import("@prisma/client").$Enums.ExpenseMethod;
        status: import("@prisma/client").$Enums.ExpenseStatus;
        note: string | null;
        receiptUrl: string | null;
        recordedById: string;
        branchId: string | null;
        expenseDate: Date;
        createdAt: Date;
        updatedAt: Date;
    }) | null>;
}
