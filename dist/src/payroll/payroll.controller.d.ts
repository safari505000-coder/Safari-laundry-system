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
        branchId: string;
        userId: string;
        status: import("@prisma/client").$Enums.PayrollStatus;
        basicSalary: import("@prisma/client-runtime-utils").Decimal;
        allowances: import("@prisma/client-runtime-utils").Decimal;
        deductions: import("@prisma/client-runtime-utils").Decimal;
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
        branchId: string;
        userId: string;
        status: import("@prisma/client").$Enums.PayrollStatus;
        basicSalary: import("@prisma/client-runtime-utils").Decimal;
        allowances: import("@prisma/client-runtime-utils").Decimal;
        deductions: import("@prisma/client-runtime-utils").Decimal;
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
        branchId: string;
        userId: string;
        status: import("@prisma/client").$Enums.PayrollStatus;
        basicSalary: import("@prisma/client-runtime-utils").Decimal;
        allowances: import("@prisma/client-runtime-utils").Decimal;
        deductions: import("@prisma/client-runtime-utils").Decimal;
        paymentDate: Date;
    })[]>;
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
        basicSalary: import("@prisma/client-runtime-utils").Decimal;
        allowances: import("@prisma/client-runtime-utils").Decimal;
        deductions: import("@prisma/client-runtime-utils").Decimal;
        paymentDate: Date;
    }>;
}
