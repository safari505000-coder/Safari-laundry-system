import { Prisma, SafariRole } from '@prisma/client';
import { CommissionPayoutsService } from '../commissions/commission-payouts.service';
import { DebtHoldsService } from '../debt-holds/debt-holds.service';
import { LoansService } from '../loans/loans.service';
import { PrismaService } from '../prisma/prisma.service';
export declare class PayrollService {
    private readonly prisma;
    private readonly loans;
    private readonly commissionPayouts;
    private readonly debtHolds;
    constructor(prisma: PrismaService, loans: LoansService, commissionPayouts: CommissionPayoutsService, debtHolds: DebtHoldsService);
    private assertOwnerOrManager;
    create(actorRole: SafariRole, dto: {
        userId: string;
        branchId: string;
        basicSalary: number;
        allowances?: number;
        deductions?: number;
        paymentDate: string;
    }): Promise<{
        branch: {
            id: string;
            name: string;
        };
        user: {
            id: string;
            username: string;
            fullName: string;
        };
    } & {
        id: string;
        branchId: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        status: import("@prisma/client").$Enums.PayrollStatus;
        basicSalary: Prisma.Decimal;
        allowances: Prisma.Decimal;
        deductions: Prisma.Decimal;
        commissionAmount: Prisma.Decimal;
        debtHoldAmount: Prisma.Decimal;
        debtReleaseAmount: Prisma.Decimal;
        paymentDate: Date;
    }>;
    markPaid(actorRole: SafariRole, id: string): Promise<{
        branch: {
            id: string;
            name: string;
        };
        user: {
            id: string;
            username: string;
            fullName: string;
        };
    } & {
        id: string;
        branchId: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        status: import("@prisma/client").$Enums.PayrollStatus;
        basicSalary: Prisma.Decimal;
        allowances: Prisma.Decimal;
        deductions: Prisma.Decimal;
        commissionAmount: Prisma.Decimal;
        debtHoldAmount: Prisma.Decimal;
        debtReleaseAmount: Prisma.Decimal;
        paymentDate: Date;
    }>;
    list(actorRole: SafariRole, fromIso: string, toIso: string, branchId?: string): Promise<({
        branch: {
            id: string;
            name: string;
        };
        user: {
            id: string;
            username: string;
            fullName: string;
        };
    } & {
        id: string;
        branchId: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        status: import("@prisma/client").$Enums.PayrollStatus;
        basicSalary: Prisma.Decimal;
        allowances: Prisma.Decimal;
        deductions: Prisma.Decimal;
        commissionAmount: Prisma.Decimal;
        debtHoldAmount: Prisma.Decimal;
        debtReleaseAmount: Prisma.Decimal;
        paymentDate: Date;
    })[]>;
    findOne(actorRole: SafariRole, actorUserId: string, id: string): Promise<{
        branch: {
            id: string;
            name: string;
            location: string;
        };
        user: {
            id: string;
            username: string;
            employeeId: string | null;
            civilId: string | null;
            fullName: string;
            jobTitle: string | null;
            nationality: string | null;
            address: string | null;
            bankName: string | null;
            bankIban: string | null;
            hireDate: Date | null;
        };
    } & {
        id: string;
        branchId: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        status: import("@prisma/client").$Enums.PayrollStatus;
        basicSalary: Prisma.Decimal;
        allowances: Prisma.Decimal;
        deductions: Prisma.Decimal;
        commissionAmount: Prisma.Decimal;
        debtHoldAmount: Prisma.Decimal;
        debtReleaseAmount: Prisma.Decimal;
        paymentDate: Date;
    }>;
    sumPaidNetInRange(from: Date, to: Date, branchId?: string): Promise<string>;
}
