import { ExpenseCategory, Prisma, SafariRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
export declare class ExpensesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private assertCanManage;
    create(userId: string, safariRole: SafariRole, dto: {
        title: string;
        amount: number;
        category: ExpenseCategory;
        note?: string;
        receiptImageData?: string;
    }): Promise<{
        id: string;
        branchId: string | null;
        createdAt: Date;
        updatedAt: Date;
        amount: Prisma.Decimal;
        title: string;
        category: import("@prisma/client").$Enums.ExpenseCategory;
        note: string | null;
        receiptImageData: string | null;
        recordedById: string;
        expenseDate: Date;
    }>;
    listForUser(_userId: string, safariRole: SafariRole, fromIso: string, toIso: string, branchId?: string): Promise<({
        recordedBy: {
            id: string;
            username: string;
            fullName: string;
        };
    } & {
        id: string;
        branchId: string | null;
        createdAt: Date;
        updatedAt: Date;
        amount: Prisma.Decimal;
        title: string;
        category: import("@prisma/client").$Enums.ExpenseCategory;
        note: string | null;
        receiptImageData: string | null;
        recordedById: string;
        expenseDate: Date;
    })[]>;
    private branchWhere;
    sumInRange(from: Date, to: Date, branchId?: string): Promise<string>;
    sumInRangeByCategories(from: Date, to: Date, categories: ExpenseCategory[], branchId?: string): Promise<string>;
}
