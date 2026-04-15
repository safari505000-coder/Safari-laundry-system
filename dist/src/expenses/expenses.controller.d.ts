import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpensesService } from './expenses.service';
import { ExpensesQueryDto } from './dto/expenses-query.dto';
export declare class ExpensesController {
    private readonly expensesService;
    constructor(expensesService: ExpensesService);
    create(dto: CreateExpenseDto, user: JwtUser): Promise<{
        id: string;
        branchId: string | null;
        createdAt: Date;
        updatedAt: Date;
        amount: import("@prisma/client-runtime-utils").Decimal;
        title: string;
        category: import("@prisma/client").$Enums.ExpenseCategory;
        note: string | null;
        receiptImageData: string | null;
        recordedById: string;
        expenseDate: Date;
    }>;
    list(q: ExpensesQueryDto, user: JwtUser): Promise<({
        recordedBy: {
            id: string;
            username: string;
            fullName: string;
        };
    } & {
        id: string;
        branchId: string | null;
        createdAt: Date;
        updatedAt: Date;
        amount: import("@prisma/client-runtime-utils").Decimal;
        title: string;
        category: import("@prisma/client").$Enums.ExpenseCategory;
        note: string | null;
        receiptImageData: string | null;
        recordedById: string;
        expenseDate: Date;
    })[]>;
}
