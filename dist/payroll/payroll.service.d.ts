import { Prisma, SafariRole } from '@prisma/client';
import { CommissionPayoutsService } from '../commissions/commission-payouts.service';
import { DebtHoldsService } from '../debt-holds/debt-holds.service';
import { LoansService } from '../loans/loans.service';
import { PrismaService } from '../prisma/prisma.service';
export declare class PayrollService {
    private readonly prisma;
    private readonly commissionPayouts;
    private readonly debtHolds;
    private readonly loans;
    constructor(prisma: PrismaService, commissionPayouts: CommissionPayoutsService, debtHolds: DebtHoldsService, loans: LoansService);
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
        status: import("@prisma/client").$Enums.PayrollStatus;
        branchId: string;
        userId: string;
        basicSalary: Prisma.Decimal;
        allowances: Prisma.Decimal;
        deductions: Prisma.Decimal;
        commissionAmount: Prisma.Decimal;
        debtHoldAmount: Prisma.Decimal;
        debtReleaseAmount: Prisma.Decimal;
        loanDeduction: Prisma.Decimal;
        paymentDate: Date;
    }>;
    recalcLoanDeduction(actorRole: SafariRole, id: string): Promise<{
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
        status: import("@prisma/client").$Enums.PayrollStatus;
        branchId: string;
        userId: string;
        basicSalary: Prisma.Decimal;
        allowances: Prisma.Decimal;
        deductions: Prisma.Decimal;
        commissionAmount: Prisma.Decimal;
        debtHoldAmount: Prisma.Decimal;
        debtReleaseAmount: Prisma.Decimal;
        loanDeduction: Prisma.Decimal;
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
        status: import("@prisma/client").$Enums.PayrollStatus;
        branchId: string;
        userId: string;
        basicSalary: Prisma.Decimal;
        allowances: Prisma.Decimal;
        deductions: Prisma.Decimal;
        commissionAmount: Prisma.Decimal;
        debtHoldAmount: Prisma.Decimal;
        debtReleaseAmount: Prisma.Decimal;
        loanDeduction: Prisma.Decimal;
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
        status: import("@prisma/client").$Enums.PayrollStatus;
        branchId: string;
        userId: string;
        basicSalary: Prisma.Decimal;
        allowances: Prisma.Decimal;
        deductions: Prisma.Decimal;
        commissionAmount: Prisma.Decimal;
        debtHoldAmount: Prisma.Decimal;
        debtReleaseAmount: Prisma.Decimal;
        loanDeduction: Prisma.Decimal;
        paymentDate: Date;
    })[]>;
    findOne(actorRole: SafariRole, actorUserId: string, id: string): Promise<{
        user: {
            id: string;
            address: string | null;
            username: string;
            employeeId: string | null;
            civilId: string | null;
            fullName: string;
            jobTitle: string | null;
            nationality: string | null;
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
        status: import("@prisma/client").$Enums.PayrollStatus;
        branchId: string;
        userId: string;
        basicSalary: Prisma.Decimal;
        allowances: Prisma.Decimal;
        deductions: Prisma.Decimal;
        commissionAmount: Prisma.Decimal;
        debtHoldAmount: Prisma.Decimal;
        debtReleaseAmount: Prisma.Decimal;
        loanDeduction: Prisma.Decimal;
        paymentDate: Date;
    }>;
    sumPaidNetInRange(from: Date, to: Date, branchId?: string): Promise<string>;
}
