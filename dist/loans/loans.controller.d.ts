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
                name: string;
                id: string;
            } | null;
            id: string;
            username: string;
            fullName: string;
            employeeId: string | null;
            jobTitle: string | null;
            civilId: string | null;
        };
        approvedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        status: import(".prisma/client").$Enums.LoanStatus;
        userId: string;
        amount: import("@prisma/client-runtime-utils/dist").Decimal;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        reason: string | null;
        approvedById: string | null;
        approvedAt: Date | null;
        installmentCount: number;
        monthlyDeduction: import("@prisma/client-runtime-utils/dist").Decimal;
        remaining: import("@prisma/client-runtime-utils/dist").Decimal;
        rejectedReason: string | null;
        lastDeductionYearMonth: string | null;
    }>;
    list(q: ListLoansQueryDto, user: JwtUser): Promise<({
        user: {
            branch: {
                name: string;
                id: string;
            } | null;
            id: string;
            username: string;
            fullName: string;
            employeeId: string | null;
            jobTitle: string | null;
            civilId: string | null;
        };
        approvedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        status: import(".prisma/client").$Enums.LoanStatus;
        userId: string;
        amount: import("@prisma/client-runtime-utils/dist").Decimal;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        reason: string | null;
        approvedById: string | null;
        approvedAt: Date | null;
        installmentCount: number;
        monthlyDeduction: import("@prisma/client-runtime-utils/dist").Decimal;
        remaining: import("@prisma/client-runtime-utils/dist").Decimal;
        rejectedReason: string | null;
        lastDeductionYearMonth: string | null;
    })[]>;
    mine(user: JwtUser): Promise<({
        user: {
            branch: {
                name: string;
                id: string;
            } | null;
            id: string;
            username: string;
            fullName: string;
            employeeId: string | null;
            jobTitle: string | null;
            civilId: string | null;
        };
        approvedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        status: import(".prisma/client").$Enums.LoanStatus;
        userId: string;
        amount: import("@prisma/client-runtime-utils/dist").Decimal;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        reason: string | null;
        approvedById: string | null;
        approvedAt: Date | null;
        installmentCount: number;
        monthlyDeduction: import("@prisma/client-runtime-utils/dist").Decimal;
        remaining: import("@prisma/client-runtime-utils/dist").Decimal;
        rejectedReason: string | null;
        lastDeductionYearMonth: string | null;
    })[]>;
    findOne(id: string, user: JwtUser): Promise<{
        user: {
            branch: {
                name: string;
                id: string;
            } | null;
            id: string;
            username: string;
            fullName: string;
            employeeId: string | null;
            jobTitle: string | null;
            civilId: string | null;
        };
        approvedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        status: import(".prisma/client").$Enums.LoanStatus;
        userId: string;
        amount: import("@prisma/client-runtime-utils/dist").Decimal;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        reason: string | null;
        approvedById: string | null;
        approvedAt: Date | null;
        installmentCount: number;
        monthlyDeduction: import("@prisma/client-runtime-utils/dist").Decimal;
        remaining: import("@prisma/client-runtime-utils/dist").Decimal;
        rejectedReason: string | null;
        lastDeductionYearMonth: string | null;
    }>;
    approve(id: string, user: JwtUser): Promise<{
        user: {
            branch: {
                name: string;
                id: string;
            } | null;
            id: string;
            username: string;
            fullName: string;
            employeeId: string | null;
            jobTitle: string | null;
            civilId: string | null;
        };
        approvedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        status: import(".prisma/client").$Enums.LoanStatus;
        userId: string;
        amount: import("@prisma/client-runtime-utils/dist").Decimal;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        reason: string | null;
        approvedById: string | null;
        approvedAt: Date | null;
        installmentCount: number;
        monthlyDeduction: import("@prisma/client-runtime-utils/dist").Decimal;
        remaining: import("@prisma/client-runtime-utils/dist").Decimal;
        rejectedReason: string | null;
        lastDeductionYearMonth: string | null;
    }>;
    reject(id: string, dto: RejectLoanDto, user: JwtUser): Promise<{
        user: {
            branch: {
                name: string;
                id: string;
            } | null;
            id: string;
            username: string;
            fullName: string;
            employeeId: string | null;
            jobTitle: string | null;
            civilId: string | null;
        };
        approvedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        status: import(".prisma/client").$Enums.LoanStatus;
        userId: string;
        amount: import("@prisma/client-runtime-utils/dist").Decimal;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        reason: string | null;
        approvedById: string | null;
        approvedAt: Date | null;
        installmentCount: number;
        monthlyDeduction: import("@prisma/client-runtime-utils/dist").Decimal;
        remaining: import("@prisma/client-runtime-utils/dist").Decimal;
        rejectedReason: string | null;
        lastDeductionYearMonth: string | null;
    }>;
    deduct(id: string, dto: DeductLoanDto, user: JwtUser): Promise<{
        user: {
            branch: {
                name: string;
                id: string;
            } | null;
            id: string;
            username: string;
            fullName: string;
            employeeId: string | null;
            jobTitle: string | null;
            civilId: string | null;
        };
        approvedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        status: import(".prisma/client").$Enums.LoanStatus;
        userId: string;
        amount: import("@prisma/client-runtime-utils/dist").Decimal;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        reason: string | null;
        approvedById: string | null;
        approvedAt: Date | null;
        installmentCount: number;
        monthlyDeduction: import("@prisma/client-runtime-utils/dist").Decimal;
        remaining: import("@prisma/client-runtime-utils/dist").Decimal;
        rejectedReason: string | null;
        lastDeductionYearMonth: string | null;
    }>;
}
