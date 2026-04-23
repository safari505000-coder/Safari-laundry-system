import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { CreateLoanDto, RejectLoanDto } from './dto/create-loan.dto';
import { DeductLoanDto } from './dto/deduct-loan.dto';
import { ListLoansQueryDto } from './dto/list-loans-query.dto';
import { LoansService } from './loans.service';
export declare class LoansController {
    private readonly loans;
    constructor(loans: LoansService);
    create(dto: CreateLoanDto, user: JwtUser): Promise<{
        user: {
            branch: {
                id: string;
                name: string;
            } | null;
            id: string;
            username: string;
            employeeId: string | null;
            civilId: string | null;
            fullName: string;
            jobTitle: string | null;
        };
        approvedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        id: string;
        amount: import("@prisma/client-runtime-utils").Decimal;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.LoanStatus;
        reason: string | null;
        userId: string;
        approvedAt: Date | null;
        approvedById: string | null;
        installmentCount: number;
        monthlyDeduction: import("@prisma/client-runtime-utils").Decimal;
        remaining: import("@prisma/client-runtime-utils").Decimal;
        rejectedReason: string | null;
        lastDeductionYearMonth: string | null;
    }>;
    list(q: ListLoansQueryDto, user: JwtUser): Promise<({
        user: {
            branch: {
                id: string;
                name: string;
            } | null;
            id: string;
            username: string;
            employeeId: string | null;
            civilId: string | null;
            fullName: string;
            jobTitle: string | null;
        };
        approvedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        id: string;
        amount: import("@prisma/client-runtime-utils").Decimal;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.LoanStatus;
        reason: string | null;
        userId: string;
        approvedAt: Date | null;
        approvedById: string | null;
        installmentCount: number;
        monthlyDeduction: import("@prisma/client-runtime-utils").Decimal;
        remaining: import("@prisma/client-runtime-utils").Decimal;
        rejectedReason: string | null;
        lastDeductionYearMonth: string | null;
    })[]>;
    mine(user: JwtUser): Promise<({
        user: {
            branch: {
                id: string;
                name: string;
            } | null;
            id: string;
            username: string;
            employeeId: string | null;
            civilId: string | null;
            fullName: string;
            jobTitle: string | null;
        };
        approvedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        id: string;
        amount: import("@prisma/client-runtime-utils").Decimal;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.LoanStatus;
        reason: string | null;
        userId: string;
        approvedAt: Date | null;
        approvedById: string | null;
        installmentCount: number;
        monthlyDeduction: import("@prisma/client-runtime-utils").Decimal;
        remaining: import("@prisma/client-runtime-utils").Decimal;
        rejectedReason: string | null;
        lastDeductionYearMonth: string | null;
    })[]>;
    findOne(id: string, user: JwtUser): Promise<{
        user: {
            branch: {
                id: string;
                name: string;
            } | null;
            id: string;
            username: string;
            employeeId: string | null;
            civilId: string | null;
            fullName: string;
            jobTitle: string | null;
        };
        approvedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        id: string;
        amount: import("@prisma/client-runtime-utils").Decimal;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.LoanStatus;
        reason: string | null;
        userId: string;
        approvedAt: Date | null;
        approvedById: string | null;
        installmentCount: number;
        monthlyDeduction: import("@prisma/client-runtime-utils").Decimal;
        remaining: import("@prisma/client-runtime-utils").Decimal;
        rejectedReason: string | null;
        lastDeductionYearMonth: string | null;
    }>;
    approve(id: string, user: JwtUser): Promise<{
        user: {
            branch: {
                id: string;
                name: string;
            } | null;
            id: string;
            username: string;
            employeeId: string | null;
            civilId: string | null;
            fullName: string;
            jobTitle: string | null;
        };
        approvedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        id: string;
        amount: import("@prisma/client-runtime-utils").Decimal;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.LoanStatus;
        reason: string | null;
        userId: string;
        approvedAt: Date | null;
        approvedById: string | null;
        installmentCount: number;
        monthlyDeduction: import("@prisma/client-runtime-utils").Decimal;
        remaining: import("@prisma/client-runtime-utils").Decimal;
        rejectedReason: string | null;
        lastDeductionYearMonth: string | null;
    }>;
    reject(id: string, dto: RejectLoanDto, user: JwtUser): Promise<{
        user: {
            branch: {
                id: string;
                name: string;
            } | null;
            id: string;
            username: string;
            employeeId: string | null;
            civilId: string | null;
            fullName: string;
            jobTitle: string | null;
        };
        approvedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        id: string;
        amount: import("@prisma/client-runtime-utils").Decimal;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.LoanStatus;
        reason: string | null;
        userId: string;
        approvedAt: Date | null;
        approvedById: string | null;
        installmentCount: number;
        monthlyDeduction: import("@prisma/client-runtime-utils").Decimal;
        remaining: import("@prisma/client-runtime-utils").Decimal;
        rejectedReason: string | null;
        lastDeductionYearMonth: string | null;
    }>;
    deduct(id: string, dto: DeductLoanDto, user: JwtUser): Promise<{
        user: {
            branch: {
                id: string;
                name: string;
            } | null;
            id: string;
            username: string;
            employeeId: string | null;
            civilId: string | null;
            fullName: string;
            jobTitle: string | null;
        };
        approvedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        id: string;
        amount: import("@prisma/client-runtime-utils").Decimal;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.LoanStatus;
        reason: string | null;
        userId: string;
        approvedAt: Date | null;
        approvedById: string | null;
        installmentCount: number;
        monthlyDeduction: import("@prisma/client-runtime-utils").Decimal;
        remaining: import("@prisma/client-runtime-utils").Decimal;
        rejectedReason: string | null;
        lastDeductionYearMonth: string | null;
    }>;
}
