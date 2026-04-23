import { ExpenseCategory, ExpenseMethod, ExpenseStatus, Prisma, SafariRole } from '@prisma/client';
import { GeneralLedgerService } from '../general-ledger/general-ledger.service';
import { PrismaService } from '../prisma/prisma.service';
export declare class ExpensesService {
    private readonly prisma;
    private readonly generalLedger;
    constructor(prisma: PrismaService, generalLedger: GeneralLedgerService);
    private assertCanRecordExpense;
    private computeDriverSpendableCash;
    create(userId: string, safariRole: SafariRole, dto: {
        title: string;
        amount: number;
        category: ExpenseCategory;
        expenseMethod?: ExpenseMethod;
        note?: string;
        receiptUrl?: string;
    }): Promise<{
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
        amount: Prisma.Decimal;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.ExpenseStatus;
        branchId: string | null;
        category: import("@prisma/client").$Enums.ExpenseCategory;
        note: string | null;
        title: string;
        recordedById: string;
        expenseMethod: import("@prisma/client").$Enums.ExpenseMethod;
        expenseDate: Date;
    }>;
    listForUser(userId: string, safariRole: SafariRole, fromIso: string, toIso: string, branchId?: string, status?: ExpenseStatus): Promise<{
        receiptUrl: string | null;
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
        amount: Prisma.Decimal;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.ExpenseStatus;
        branchId: string | null;
        category: import("@prisma/client").$Enums.ExpenseCategory;
        note: string | null;
        title: string;
        recordedById: string;
        expenseMethod: import("@prisma/client").$Enums.ExpenseMethod;
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
        amount: Prisma.Decimal;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.ExpenseStatus;
        branchId: string | null;
        category: import("@prisma/client").$Enums.ExpenseCategory;
        note: string | null;
        title: string;
        receiptUrl: string | null;
        recordedById: string;
        expenseMethod: import("@prisma/client").$Enums.ExpenseMethod;
        expenseDate: Date;
    })[]>;
    updateStatus(id: string, safariRole: SafariRole, status: ExpenseStatus, actorUserId: string): Promise<{
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
        amount: Prisma.Decimal;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.ExpenseStatus;
        branchId: string | null;
        category: import("@prisma/client").$Enums.ExpenseCategory;
        note: string | null;
        title: string;
        receiptUrl: string | null;
        recordedById: string;
        expenseMethod: import("@prisma/client").$Enums.ExpenseMethod;
        expenseDate: Date;
    }>;
    private branchWhere;
    sumInRange(from: Date, to: Date, branchId?: string, recordedById?: string): Promise<string>;
    sumInRangeByCategories(from: Date, to: Date, categories: ExpenseCategory[], branchId?: string, recordedById?: string): Promise<string>;
}
