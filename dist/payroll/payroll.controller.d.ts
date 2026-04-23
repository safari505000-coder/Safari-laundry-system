import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { CreatePayrollDto } from './dto/create-payroll.dto';
import { PayrollQueryDto } from './dto/payroll-query.dto';
import { PayrollService } from './payroll.service';
export declare class PayrollController {
    private readonly payrollService;
    constructor(payrollService: PayrollService);
    create(dto: CreatePayrollDto, user: JwtUser): Promise<{
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
        basicSalary: import("@prisma/client-runtime-utils").Decimal;
        allowances: import("@prisma/client-runtime-utils").Decimal;
        deductions: import("@prisma/client-runtime-utils").Decimal;
        commissionAmount: import("@prisma/client-runtime-utils").Decimal;
        debtHoldAmount: import("@prisma/client-runtime-utils").Decimal;
        debtReleaseAmount: import("@prisma/client-runtime-utils").Decimal;
        loanDeduction: import("@prisma/client-runtime-utils").Decimal;
        paymentDate: Date;
    }>;
    markPaid(id: string, user: JwtUser): Promise<{
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
        basicSalary: import("@prisma/client-runtime-utils").Decimal;
        allowances: import("@prisma/client-runtime-utils").Decimal;
        deductions: import("@prisma/client-runtime-utils").Decimal;
        commissionAmount: import("@prisma/client-runtime-utils").Decimal;
        debtHoldAmount: import("@prisma/client-runtime-utils").Decimal;
        debtReleaseAmount: import("@prisma/client-runtime-utils").Decimal;
        loanDeduction: import("@prisma/client-runtime-utils").Decimal;
        paymentDate: Date;
    }>;
    recalcLoan(id: string, user: JwtUser): Promise<{
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
        basicSalary: import("@prisma/client-runtime-utils").Decimal;
        allowances: import("@prisma/client-runtime-utils").Decimal;
        deductions: import("@prisma/client-runtime-utils").Decimal;
        commissionAmount: import("@prisma/client-runtime-utils").Decimal;
        debtHoldAmount: import("@prisma/client-runtime-utils").Decimal;
        debtReleaseAmount: import("@prisma/client-runtime-utils").Decimal;
        loanDeduction: import("@prisma/client-runtime-utils").Decimal;
        paymentDate: Date;
    }>;
    list(q: PayrollQueryDto, user: JwtUser): Promise<({
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
        basicSalary: import("@prisma/client-runtime-utils").Decimal;
        allowances: import("@prisma/client-runtime-utils").Decimal;
        deductions: import("@prisma/client-runtime-utils").Decimal;
        commissionAmount: import("@prisma/client-runtime-utils").Decimal;
        debtHoldAmount: import("@prisma/client-runtime-utils").Decimal;
        debtReleaseAmount: import("@prisma/client-runtime-utils").Decimal;
        loanDeduction: import("@prisma/client-runtime-utils").Decimal;
        paymentDate: Date;
    })[]>;
    findOne(id: string, user: JwtUser): Promise<{
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
        basicSalary: import("@prisma/client-runtime-utils").Decimal;
        allowances: import("@prisma/client-runtime-utils").Decimal;
        deductions: import("@prisma/client-runtime-utils").Decimal;
        commissionAmount: import("@prisma/client-runtime-utils").Decimal;
        debtHoldAmount: import("@prisma/client-runtime-utils").Decimal;
        debtReleaseAmount: import("@prisma/client-runtime-utils").Decimal;
        loanDeduction: import("@prisma/client-runtime-utils").Decimal;
        paymentDate: Date;
    }>;
}
