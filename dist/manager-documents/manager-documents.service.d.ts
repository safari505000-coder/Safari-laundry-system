import { Prisma } from "@prisma/client";
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
        branch: {
            name: string;
            id: string;
        } | null;
        recordedBy: {
            id: string;
            username: string;
            fullName: string;
        };
    } & {
        status: import(".prisma/client").$Enums.ExpenseStatus;
        branchId: string | null;
        title: string;
        amount: Prisma.Decimal;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        note: string | null;
        receiptUrl: string | null;
        category: import(".prisma/client").$Enums.ExpenseCategory;
        recordedById: string;
        expenseMethod: import(".prisma/client").$Enums.ExpenseMethod;
        expenseDate: Date;
    }) | null>;
}
