import { Prisma, SafariRole } from "@prisma/client";
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
            name: string;
            id: string;
        };
    } & {
        status: import(".prisma/client").$Enums.PayrollStatus;
        userId: string;
        branchId: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
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
            name: string;
            id: string;
        };
    } & {
        status: import(".prisma/client").$Enums.PayrollStatus;
        userId: string;
        branchId: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
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
            name: string;
            id: string;
        };
    } & {
        status: import(".prisma/client").$Enums.PayrollStatus;
        userId: string;
        branchId: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
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
            bankIban: string | null;
            payrollRosterLineOrder: number | null;
        };
        branch: {
            name: string;
            id: string;
            payrollRosterSortOrder: number | null;
        };
    } & {
        status: import(".prisma/client").$Enums.PayrollStatus;
        userId: string;
        branchId: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
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
            name: string;
            id: string;
            location: string;
        };
    } & {
        status: import(".prisma/client").$Enums.PayrollStatus;
        userId: string;
        branchId: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
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
    listAdHocLines(actorRole: SafariRole, periodYm: string, branchId?: string): Promise<({
        branch: {
            name: string;
            id: string;
        };
    } & {
        branchId: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        bankName: string | null;
        bankIban: string | null;
        note: string | null;
        basicSalary: Prisma.Decimal;
        allowances: Prisma.Decimal;
        deductions: Prisma.Decimal;
        periodYm: string;
        lineSort: number;
        beneficiaryName: string;
    })[]>;
    createAdHocLine(actorRole: SafariRole, dto: {
        branchId: string;
        periodYm: string;
        beneficiaryName: string;
        bankName?: string | null;
        bankIban?: string | null;
        basicSalary: number;
        allowances?: number;
        deductions?: number;
        lineSort?: number;
        note?: string | null;
    }): Promise<{
        branch: {
            name: string;
            id: string;
        };
    } & {
        branchId: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        bankName: string | null;
        bankIban: string | null;
        note: string | null;
        basicSalary: Prisma.Decimal;
        allowances: Prisma.Decimal;
        deductions: Prisma.Decimal;
        periodYm: string;
        lineSort: number;
        beneficiaryName: string;
    }>;
    updateAdHocLine(actorRole: SafariRole, id: string, dto: {
        beneficiaryName?: string;
        bankName?: string | null;
        bankIban?: string | null;
        basicSalary?: number;
        allowances?: number;
        deductions?: number;
        lineSort?: number;
        note?: string | null;
    }): Promise<{
        branch: {
            name: string;
            id: string;
        };
    } & {
        branchId: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        bankName: string | null;
        bankIban: string | null;
        note: string | null;
        basicSalary: Prisma.Decimal;
        allowances: Prisma.Decimal;
        deductions: Prisma.Decimal;
        periodYm: string;
        lineSort: number;
        beneficiaryName: string;
    }>;
    deleteAdHocLine(actorRole: SafariRole, id: string): Promise<{
        id: string;
        deleted: boolean;
    }>;
}
