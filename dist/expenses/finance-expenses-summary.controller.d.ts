import { ExpensesSummaryQueryDto, ExpensesSummaryResponseDto } from './dto/expenses-summary.dto';
import { ExpensesService } from './expenses.service';
export declare class FinanceExpensesSummaryController {
    private readonly expensesService;
    constructor(expensesService: ExpensesService);
    getExpensesSummary(q: ExpensesSummaryQueryDto): Promise<ExpensesSummaryResponseDto>;
}
