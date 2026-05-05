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
        basicSalary: import("@prisma/client-runtime-utils/dist").Decimal;
        allowances: import("@prisma/client-runtime-utils/dist").Decimal;
        deductions: import("@prisma/client-runtime-utils/dist").Decimal;
        commissionAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        debtHoldAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        debtReleaseAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        loanDeduction: import("@prisma/client-runtime-utils/dist").Decimal;
        paymentDate: Date;
    }>;
    markPaid(id: string, user: JwtUser): Promise<{
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
        basicSalary: import("@prisma/client-runtime-utils/dist").Decimal;
        allowances: import("@prisma/client-runtime-utils/dist").Decimal;
        deductions: import("@prisma/client-runtime-utils/dist").Decimal;
        commissionAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        debtHoldAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        debtReleaseAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        loanDeduction: import("@prisma/client-runtime-utils/dist").Decimal;
        paymentDate: Date;
    }>;
    recalcLoan(id: string, user: JwtUser): Promise<{
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
        basicSalary: import("@prisma/client-runtime-utils/dist").Decimal;
        allowances: import("@prisma/client-runtime-utils/dist").Decimal;
        deductions: import("@prisma/client-runtime-utils/dist").Decimal;
        commissionAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        debtHoldAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        debtReleaseAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        loanDeduction: import("@prisma/client-runtime-utils/dist").Decimal;
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
        basicSalary: import("@prisma/client-runtime-utils/dist").Decimal;
        allowances: import("@prisma/client-runtime-utils/dist").Decimal;
        deductions: import("@prisma/client-runtime-utils/dist").Decimal;
        commissionAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        debtHoldAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        debtReleaseAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        loanDeduction: import("@prisma/client-runtime-utils/dist").Decimal;
        paymentDate: Date;
    })[]>;
    listAdHoc(ym: string, branchId: string | undefined, user: JwtUser): Promise<({
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
        basicSalary: import("@prisma/client-runtime-utils/dist").Decimal;
        allowances: import("@prisma/client-runtime-utils/dist").Decimal;
        deductions: import("@prisma/client-runtime-utils/dist").Decimal;
        periodYm: string;
        lineSort: number;
        beneficiaryName: string;
    })[]>;
    createAdHoc(dto: CreatePayrollAdhocLineDto, user: JwtUser): Promise<{
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
        basicSalary: import("@prisma/client-runtime-utils/dist").Decimal;
        allowances: import("@prisma/client-runtime-utils/dist").Decimal;
        deductions: import("@prisma/client-runtime-utils/dist").Decimal;
        periodYm: string;
        lineSort: number;
        beneficiaryName: string;
    }>;
    updateAdHoc(id: string, dto: UpdatePayrollAdhocLineDto, user: JwtUser): Promise<{
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
        basicSalary: import("@prisma/client-runtime-utils/dist").Decimal;
        allowances: import("@prisma/client-runtime-utils/dist").Decimal;
        deductions: import("@prisma/client-runtime-utils/dist").Decimal;
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
        basicSalary: import("@prisma/client-runtime-utils/dist").Decimal;
        allowances: import("@prisma/client-runtime-utils/dist").Decimal;
        deductions: import("@prisma/client-runtime-utils/dist").Decimal;
        commissionAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        debtHoldAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        debtReleaseAmount: import("@prisma/client-runtime-utils/dist").Decimal;
        loanDeduction: import("@prisma/client-runtime-utils/dist").Decimal;
        paymentDate: Date;
    }>;
}
