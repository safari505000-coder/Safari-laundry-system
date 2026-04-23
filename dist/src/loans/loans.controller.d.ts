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
            id: string;
            username: string;
            branch: {
                id: string;
                name: string;
            } | null;
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
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        amount: import("@prisma/client-runtime-utils").Decimal;
        status: import("@prisma/client").$Enums.LoanStatus;
        reason: string | null;
        approvedById: string | null;
        approvedAt: Date | null;
        rejectedReason: string | null;
        installmentCount: number;
        monthlyDeduction: import("@prisma/client-runtime-utils").Decimal;
        remaining: import("@prisma/client-runtime-utils").Decimal;
    }>;
    list(q: ListLoansQueryDto, user: JwtUser): Promise<({
        user: {
            id: string;
            username: string;
            branch: {
                id: string;
                name: string;
            } | null;
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
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        amount: import("@prisma/client-runtime-utils").Decimal;
        status: import("@prisma/client").$Enums.LoanStatus;
        reason: string | null;
        approvedById: string | null;
        approvedAt: Date | null;
        rejectedReason: string | null;
        installmentCount: number;
        monthlyDeduction: import("@prisma/client-runtime-utils").Decimal;
        remaining: import("@prisma/client-runtime-utils").Decimal;
    })[]>;
    mine(user: JwtUser): Promise<({
        user: {
            id: string;
            username: string;
            branch: {
                id: string;
                name: string;
            } | null;
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
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        amount: import("@prisma/client-runtime-utils").Decimal;
        status: import("@prisma/client").$Enums.LoanStatus;
        reason: string | null;
        approvedById: string | null;
        approvedAt: Date | null;
        rejectedReason: string | null;
        installmentCount: number;
        monthlyDeduction: import("@prisma/client-runtime-utils").Decimal;
        remaining: import("@prisma/client-runtime-utils").Decimal;
    })[]>;
    findOne(id: string, user: JwtUser): Promise<{
        user: {
            id: string;
            username: string;
            branch: {
                id: string;
                name: string;
            } | null;
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
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        amount: import("@prisma/client-runtime-utils").Decimal;
        status: import("@prisma/client").$Enums.LoanStatus;
        reason: string | null;
        approvedById: string | null;
        approvedAt: Date | null;
        rejectedReason: string | null;
        installmentCount: number;
        monthlyDeduction: import("@prisma/client-runtime-utils").Decimal;
        remaining: import("@prisma/client-runtime-utils").Decimal;
    }>;
    approve(id: string, user: JwtUser): Promise<{
        user: {
            id: string;
            username: string;
            branch: {
                id: string;
                name: string;
            } | null;
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
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        amount: import("@prisma/client-runtime-utils").Decimal;
        status: import("@prisma/client").$Enums.LoanStatus;
        reason: string | null;
        approvedById: string | null;
        approvedAt: Date | null;
        rejectedReason: string | null;
        installmentCount: number;
        monthlyDeduction: import("@prisma/client-runtime-utils").Decimal;
        remaining: import("@prisma/client-runtime-utils").Decimal;
    }>;
    reject(id: string, dto: RejectLoanDto, user: JwtUser): Promise<{
        user: {
            id: string;
            username: string;
            branch: {
                id: string;
                name: string;
            } | null;
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
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        amount: import("@prisma/client-runtime-utils").Decimal;
        status: import("@prisma/client").$Enums.LoanStatus;
        reason: string | null;
        approvedById: string | null;
        approvedAt: Date | null;
        rejectedReason: string | null;
        installmentCount: number;
        monthlyDeduction: import("@prisma/client-runtime-utils").Decimal;
        remaining: import("@prisma/client-runtime-utils").Decimal;
    }>;
    deduct(id: string, dto: DeductLoanDto, user: JwtUser): Promise<{
        user: {
            id: string;
            username: string;
            branch: {
                id: string;
                name: string;
            } | null;
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
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        amount: import("@prisma/client-runtime-utils").Decimal;
        status: import("@prisma/client").$Enums.LoanStatus;
        reason: string | null;
        approvedById: string | null;
        approvedAt: Date | null;
        rejectedReason: string | null;
        installmentCount: number;
        monthlyDeduction: import("@prisma/client-runtime-utils").Decimal;
        remaining: import("@prisma/client-runtime-utils").Decimal;
    }>;
}
