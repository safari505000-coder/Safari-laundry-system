import { Prisma, SafariRole } from '@prisma/client';
import { LoansService } from '../loans/loans.service';
import { PrismaService } from '../prisma/prisma.service';
export declare class PayrollService {
    private readonly prisma;
    private readonly loans;
    constructor(prisma: PrismaService, loans: LoansService);
    private assertOwnerOrManager;
    create(actorRole: SafariRole, dto: {
        userId: string;
        branchId: string;
        basicSalary: number;
        allowances?: number;
        deductions?: number;
        paymentDate: string;
    }): Promise<{
        user: {
            id: string;
            username: string;
            fullName: string;
        };
        branch: {
            id: string;
            name: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        branchId: string;
        userId: string;
        status: import("@prisma/client").$Enums.PayrollStatus;
        basicSalary: Prisma.Decimal;
        allowances: Prisma.Decimal;
        deductions: Prisma.Decimal;
        paymentDate: Date;
    }>;
    markPaid(actorRole: SafariRole, id: string): Promise<{
        user: {
            id: string;
            username: string;
            fullName: string;
        };
        branch: {
            id: string;
            name: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        branchId: string;
        userId: string;
        status: import("@prisma/client").$Enums.PayrollStatus;
        basicSalary: Prisma.Decimal;
        allowances: Prisma.Decimal;
        deductions: Prisma.Decimal;
        paymentDate: Date;
    }>;
    list(actorRole: SafariRole, fromIso: string, toIso: string, branchId?: string): Promise<({
        user: {
            id: string;
            username: string;
            fullName: string;
        };
        branch: {
            id: string;
            name: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        branchId: string;
        userId: string;
        status: import("@prisma/client").$Enums.PayrollStatus;
        basicSalary: Prisma.Decimal;
        allowances: Prisma.Decimal;
        deductions: Prisma.Decimal;
        paymentDate: Date;
    })[]>;
    findOne(actorRole: SafariRole, actorUserId: string, id: string): Promise<{
        user: {
            id: string;
            username: string;
            fullName: string;
            employeeId: string | null;
            jobTitle: string | null;
            civilId: string | null;
            nationality: string | null;
            address: string | null;
            bankName: string | null;
            bankIban: string | null;
            hireDate: Date | null;
        };
        branch: {
            id: string;
            name: string;
            location: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        branchId: string;
        userId: string;
        status: import("@prisma/client").$Enums.PayrollStatus;
        basicSalary: Prisma.Decimal;
        allowances: Prisma.Decimal;
        deductions: Prisma.Decimal;
        paymentDate: Date;
    }>;
    sumPaidNetInRange(from: Date, to: Date, branchId?: string): Promise<string>;
}
