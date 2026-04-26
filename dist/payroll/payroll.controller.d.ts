import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { CreatePayrollAdhocLineDto } from './dto/create-payroll-adhoc-line.dto';
import { CreatePayrollDto } from './dto/create-payroll.dto';
import { PayrollQueryDto } from './dto/payroll-query.dto';
import { UpdatePayrollAdhocLineDto } from './dto/update-payroll-adhoc-line.dto';
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
        userId: string;
        branchId: string;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.PayrollStatus;
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
        userId: string;
        branchId: string;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.PayrollStatus;
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
        userId: string;
        branchId: string;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.PayrollStatus;
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
            bankIban: string | null;
            payrollRosterLineOrder: number | null;
        };
        branch: {
            id: string;
            name: string;
            payrollRosterSortOrder: number | null;
        };
    } & {
        id: string;
        createdAt: Date;
        userId: string;
        branchId: string;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.PayrollStatus;
        basicSalary: import("@prisma/client-runtime-utils").Decimal;
        allowances: import("@prisma/client-runtime-utils").Decimal;
        deductions: import("@prisma/client-runtime-utils").Decimal;
        commissionAmount: import("@prisma/client-runtime-utils").Decimal;
        debtHoldAmount: import("@prisma/client-runtime-utils").Decimal;
        debtReleaseAmount: import("@prisma/client-runtime-utils").Decimal;
        loanDeduction: import("@prisma/client-runtime-utils").Decimal;
        paymentDate: Date;
    })[]>;
    listAdHoc(ym: string, branchId: string | undefined, user: JwtUser): Promise<({
        branch: {
            id: string;
            name: string;
        };
    } & {
        id: string;
        createdAt: Date;
        branchId: string;
        updatedAt: Date;
        note: string | null;
        bankName: string | null;
        bankIban: string | null;
        basicSalary: import("@prisma/client-runtime-utils").Decimal;
        allowances: import("@prisma/client-runtime-utils").Decimal;
        deductions: import("@prisma/client-runtime-utils").Decimal;
        periodYm: string;
        lineSort: number;
        beneficiaryName: string;
    })[]>;
    createAdHoc(dto: CreatePayrollAdhocLineDto, user: JwtUser): Promise<{
        branch: {
            id: string;
            name: string;
        };
    } & {
        id: string;
        createdAt: Date;
        branchId: string;
        updatedAt: Date;
        note: string | null;
        bankName: string | null;
        bankIban: string | null;
        basicSalary: import("@prisma/client-runtime-utils").Decimal;
        allowances: import("@prisma/client-runtime-utils").Decimal;
        deductions: import("@prisma/client-runtime-utils").Decimal;
        periodYm: string;
        lineSort: number;
        beneficiaryName: string;
    }>;
    updateAdHoc(id: string, dto: UpdatePayrollAdhocLineDto, user: JwtUser): Promise<{
        branch: {
            id: string;
            name: string;
        };
    } & {
        id: string;
        createdAt: Date;
        branchId: string;
        updatedAt: Date;
        note: string | null;
        bankName: string | null;
        bankIban: string | null;
        basicSalary: import("@prisma/client-runtime-utils").Decimal;
        allowances: import("@prisma/client-runtime-utils").Decimal;
        deductions: import("@prisma/client-runtime-utils").Decimal;
        periodYm: string;
        lineSort: number;
        beneficiaryName: string;
    }>;
    removeAdHoc(id: string, user: JwtUser): Promise<{
        id: string;
        deleted: boolean;
    }>;
    findOne(id: string, user: JwtUser): Promise<{
        user: {
            id: string;
            address: string | null;
            username: string;
            fullName: string;
            employeeId: string | null;
            jobTitle: string | null;
            civilId: string | null;
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
        userId: string;
        branchId: string;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.PayrollStatus;
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
