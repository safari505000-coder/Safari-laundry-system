import { FixedExpenseCategory, Prisma, SafariRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
export declare function countAccruedMonths(rangeFrom: Date, rangeTo: Date, effFrom: Date, effTo: Date | null): number;
export declare class FixedExpenseService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private assertOwnerOrManager;
    create(role: SafariRole, dto: {
        branchId: string;
        title: string;
        category: FixedExpenseCategory;
        monthlyAmount: number;
        effectiveFrom?: string;
        effectiveTo?: string | null;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
        branchId: string;
        category: import("@prisma/client").$Enums.FixedExpenseCategory;
        title: string;
        monthlyAmount: Prisma.Decimal;
        effectiveFrom: Date;
        effectiveTo: Date | null;
    }>;
    list(branchId?: string): Promise<({
        branch: {
            id: string;
            name: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
        branchId: string;
        category: import("@prisma/client").$Enums.FixedExpenseCategory;
        title: string;
        monthlyAmount: Prisma.Decimal;
        effectiveFrom: Date;
        effectiveTo: Date | null;
    })[]>;
    sumAccruedInRange(from: Date, to: Date, branchId?: string): Promise<string>;
}
