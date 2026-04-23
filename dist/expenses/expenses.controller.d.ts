import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpensesService } from './expenses.service';
import { ExpensesQueryDto } from './dto/expenses-query.dto';
import { UpdateExpenseStatusDto } from './dto/update-expense-status.dto';
export declare class ExpensesController {
    private readonly expensesService;
    constructor(expensesService: ExpensesService);
    create(dto: CreateExpenseDto, user: JwtUser): Promise<{
        receiptUrl: null;
        branch: {
            id: string;
            name: string;
        } | null;
        recordedBy: {
            id: string;
            username: string;
            fullName: string;
        };
        id: string;
        amount: import("@prisma/client-runtime-utils").Decimal;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.ExpenseStatus;
        branchId: string | null;
        category: import("@prisma/client").$Enums.ExpenseCategory;
        note: string | null;
        title: string;
        recordedById: string;
        expenseMethod: import("@prisma/client").$Enums.ExpenseMethod;
        expenseDate: Date;
    }>;
    list(q: ExpensesQueryDto, user: JwtUser): Promise<{
        receiptUrl: string | null;
        branch: {
            id: string;
            name: string;
        } | null;
        recordedBy: {
            id: string;
            username: string;
            fullName: string;
        };
        id: string;
        amount: import("@prisma/client-runtime-utils").Decimal;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.ExpenseStatus;
        branchId: string | null;
        category: import("@prisma/client").$Enums.ExpenseCategory;
        note: string | null;
        title: string;
        recordedById: string;
        expenseMethod: import("@prisma/client").$Enums.ExpenseMethod;
        expenseDate: Date;
    }[]>;
    listPendingApproval(user: JwtUser): Promise<({
        branch: {
            id: string;
            name: string;
        } | null;
        recordedBy: {
            id: string;
            username: string;
            fullName: string;
        };
    } & {
        id: string;
        amount: import("@prisma/client-runtime-utils").Decimal;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.ExpenseStatus;
        branchId: string | null;
        category: import("@prisma/client").$Enums.ExpenseCategory;
        note: string | null;
        title: string;
        receiptUrl: string | null;
        recordedById: string;
        expenseMethod: import("@prisma/client").$Enums.ExpenseMethod;
        expenseDate: Date;
    })[]>;
    updateStatus(id: string, dto: UpdateExpenseStatusDto, user: JwtUser): Promise<{
        branch: {
            id: string;
            name: string;
        } | null;
        recordedBy: {
            id: string;
            username: string;
            fullName: string;
        };
    } & {
        id: string;
        amount: import("@prisma/client-runtime-utils").Decimal;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.ExpenseStatus;
        branchId: string | null;
        category: import("@prisma/client").$Enums.ExpenseCategory;
        note: string | null;
        title: string;
        receiptUrl: string | null;
        recordedById: string;
        expenseMethod: import("@prisma/client").$Enums.ExpenseMethod;
        expenseDate: Date;
    }>;
}
