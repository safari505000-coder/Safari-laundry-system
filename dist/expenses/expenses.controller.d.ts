import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { AuditService } from '../common/audit/audit.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpensesService } from './expenses.service';
import { ExpensesQueryDto } from './dto/expenses-query.dto';
import { UpdateExpenseStatusDto } from './dto/update-expense-status.dto';
export declare class ExpensesController {
    private readonly expensesService;
    private readonly audit;
    constructor(expensesService: ExpensesService, audit: AuditService);
    create(dto: CreateExpenseDto, user: JwtUser): Promise<{
        receiptUrl: null;
        ownerType: import("./dto/expenses-summary.dto").ExpenseOwnerType;
        branch: {
            name: string;
            id: string;
        } | null;
        recordedBy: {
            id: string;
            username: string;
            fullName: string;
        };
        status: import(".prisma/client").$Enums.ExpenseStatus;
        branchId: string | null;
        title: string;
        amount: import("@prisma/client-runtime-utils/dist").Decimal;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        note: string | null;
        category: import(".prisma/client").$Enums.ExpenseCategory;
        recordedById: string;
        expenseMethod: import(".prisma/client").$Enums.ExpenseMethod;
        expenseDate: Date;
    }>;
    list(q: ExpensesQueryDto, user: JwtUser): Promise<{
        receiptUrl: string | null;
        ownerType: import("./dto/expenses-summary.dto").ExpenseOwnerType;
        branch: {
            name: string;
            id: string;
        } | null;
        recordedBy: {
            id: string;
            username: string;
            fullName: string;
            safariRole: import(".prisma/client").$Enums.SafariRole;
        };
        status: import(".prisma/client").$Enums.ExpenseStatus;
        branchId: string | null;
        title: string;
        amount: import("@prisma/client-runtime-utils/dist").Decimal;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        note: string | null;
        category: import(".prisma/client").$Enums.ExpenseCategory;
        recordedById: string;
        expenseMethod: import(".prisma/client").$Enums.ExpenseMethod;
        expenseDate: Date;
    }[]>;
    listPendingApproval(user: JwtUser): Promise<({
        branch: {
            name: string;
            id: string;
        } | null;
        recordedBy: {
            id: string;
            username: string;
            fullName: string;
        };
    } & {
        status: import(".prisma/client").$Enums.ExpenseStatus;
        branchId: string | null;
        title: string;
        amount: import("@prisma/client-runtime-utils/dist").Decimal;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        note: string | null;
        receiptUrl: string | null;
        category: import(".prisma/client").$Enums.ExpenseCategory;
        recordedById: string;
        expenseMethod: import(".prisma/client").$Enums.ExpenseMethod;
        expenseDate: Date;
    })[]>;
    updateStatus(id: string, dto: UpdateExpenseStatusDto, user: JwtUser): Promise<{
        branch: {
            name: string;
            id: string;
        } | null;
        recordedBy: {
            id: string;
            username: string;
            fullName: string;
        };
    } & {
        status: import(".prisma/client").$Enums.ExpenseStatus;
        branchId: string | null;
        title: string;
        amount: import("@prisma/client-runtime-utils/dist").Decimal;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        note: string | null;
        receiptUrl: string | null;
        category: import(".prisma/client").$Enums.ExpenseCategory;
        recordedById: string;
        expenseMethod: import(".prisma/client").$Enums.ExpenseMethod;
        expenseDate: Date;
    }>;
}
