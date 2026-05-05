import { ExpenseCategory, ExpenseMethod, ExpenseStatus, Prisma, SafariRole } from "@prisma/client";
import { GeneralLedgerService } from '../general-ledger/general-ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ExpenseOwnerType, ExpensesSummaryResponseDto } from './dto/expenses-summary.dto';
export declare function deriveOwnerType(recordedByRole: SafariRole | null | undefined, branchId: string | null): ExpenseOwnerType;
export declare const DRIVER_ONLY_CATEGORIES: ReadonlySet<ExpenseCategory>;
export declare class ExpensesService {
    private readonly prisma;
    private readonly generalLedger;
    constructor(prisma: PrismaService, generalLedger: GeneralLedgerService);
    private assertCanRecordExpense;
    private assertCategoryMatchesRole;
    private assertOwnershipCoherent;
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
        ownerType: ExpenseOwnerType;
        branch: {
            name: string;
            id: string;
        } | null;
        recordedBy: {
            id: string;
            username: string;
            fullName: string;
        };
        status: import(".prisma/client").$Enums.ExpenseStatus;
        branchId: string | null;
        title: string;
        amount: Prisma.Decimal;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        note: string | null;
        category: import(".prisma/client").$Enums.ExpenseCategory;
        recordedById: string;
        expenseMethod: import(".prisma/client").$Enums.ExpenseMethod;
        expenseDate: Date;
    }>;
    listForUser(userId: string, safariRole: SafariRole, fromIso: string, toIso: string, branchId?: string, status?: ExpenseStatus): Promise<{
        receiptUrl: string | null;
        ownerType: ExpenseOwnerType;
        branch: {
            name: string;
            id: string;
        } | null;
        recordedBy: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import(".prisma/client").$Enums.SafariRole;
        };
        status: import(".prisma/client").$Enums.ExpenseStatus;
        branchId: string | null;
        title: string;
        amount: Prisma.Decimal;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        note: string | null;
        category: import(".prisma/client").$Enums.ExpenseCategory;
        recordedById: string;
        expenseMethod: import(".prisma/client").$Enums.ExpenseMethod;
        expenseDate: Date;
    }[]>;
    listPendingApproval(safariRole: SafariRole): Promise<({
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
    })[]>;
    updateStatus(id: string, safariRole: SafariRole, status: ExpenseStatus, actorUserId: string): Promise<{
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
    }>;
    private branchWhere;
    sumInRange(from: Date, to: Date, branchId?: string, recordedById?: string): Promise<string>;
    sumInRangeByCategories(from: Date, to: Date, categories: ExpenseCategory[], branchId?: string, recordedById?: string): Promise<string>;
    summarize(fromIso: string, toIso: string, branchId?: string): Promise<ExpensesSummaryResponseDto>;
    private buildSummaryAlerts;
}
