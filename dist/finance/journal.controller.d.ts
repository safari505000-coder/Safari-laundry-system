import { DoubleEntryJournalService } from '../general-ledger/double-entry-journal.service';
import { DebtService } from './services/debt.service';
export declare class JournalController {
    private readonly journal;
    private readonly debt;
    constructor(journal: DoubleEntryJournalService, debt: DebtService);
    getCustomerBalance(customerId: string): Promise<{
        customerId: string;
        journalBalanceKd: string;
        ledgerBalanceKd: string;
        computedAt: string;
    }>;
    getCustomerStatement(customerId: string): Promise<{
        balance: string;
        rows: import("../general-ledger/double-entry-journal.service").JournalStatementRow[];
    }>;
}
