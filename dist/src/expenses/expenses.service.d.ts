import { ExpenseCategory, ExpenseStatus, Prisma, SafariRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
export declare class ExpensesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private assertCanRecordExpense;
    create(userId: string, safariRole: SafariRole, dto: {
        title: string;
        amount: number;
        category: ExpenseCategory;
        note?: string;
        receiptUrl?: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: import("@prisma/client").$Enums.ExpenseCategory;
        branchId: string | null;
        status: import("@prisma/client").$Enums.ExpenseStatus;
        amount: Prisma.Decimal;
        title: string;
        note: string | null;
        receiptUrl: string | null;
        recordedById: string;
        expenseDate: Date;
    }>;
    listForUser(userId: string, safariRole: SafariRole, fromIso: string, toIso: string, branchId?: string, status?: ExpenseStatus): Promise<{
        receiptUrl: null;
        branch: {
            id: string;
            name: string;
        } | null;
        recordedBy: {
            id: string;
            username: string;
            fullName: string;
        };
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: import("@prisma/client").$Enums.ExpenseCategory;
        branchId: string | null;
        status: import("@prisma/client").$Enums.ExpenseStatus;
        amount: Prisma.Decimal;
        title: string;
        note: string | null;
        recordedById: string;
        expenseDate: Date;
    }[]>;
    listPendingApproval(safariRole: SafariRole): Promise<({
        branch: {
            id: string;
            name: string;
        } | null;
        recordedBy: {
            id: string;
            username: string;
            fullName: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: import("@prisma/client").$Enums.ExpenseCategory;
        branchId: string | null;
        status: import("@prisma/client").$Enums.ExpenseStatus;
        amount: Prisma.Decimal;
        title: string;
        note: string | null;
        receiptUrl: string | null;
        recordedById: string;
        expenseDate: Date;
    })[]>;
    updateStatus(id: string, safariRole: SafariRole, status: ExpenseStatus): Promise<{
        branch: {
            id: string;
            name: string;
        } | null;
        recordedBy: {
            id: string;
            username: string;
            fullName: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: import("@prisma/client").$Enums.ExpenseCategory;
        branchId: string | null;
        status: import("@prisma/client").$Enums.ExpenseStatus;
        amount: Prisma.Decimal;
        title: string;
        note: string | null;
        receiptUrl: string | null;
        recordedById: string;
        expenseDate: Date;
    }>;
    private branchWhere;
    sumInRange(from: Date, to: Date, branchId?: string): Promise<string>;
    sumInRangeByCategories(from: Date, to: Date, categories: ExpenseCategory[], branchId?: string): Promise<string>;
}
