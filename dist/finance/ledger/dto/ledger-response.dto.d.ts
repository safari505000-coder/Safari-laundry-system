export declare class LedgerEntryDto {
    id: string;
    txId: string;
    accountId: string;
    debit: string;
    credit: string;
    createdAt: string;
    meta: Record<string, unknown>;
}
export declare class LedgerAccountBalanceDto {
    accountId: string;
    totalDebit: string;
    totalCredit: string;
    balance: string;
    entryCount: number;
}
export declare class LedgerSummaryResponseDto {
    source: 'api/finance/ledger/summary';
    fromIso: string;
    toIso: string;
    totalEntries: number;
    totalTransactions: number;
    globalDebit: string;
    globalCredit: string;
    accounts: LedgerAccountBalanceDto[];
    generatedAt: string;
}
export declare class LedgerAccountResponseDto {
    source: 'api/finance/ledger/account';
    accountId: string;
    fromIso: string;
    toIso: string;
    balance: LedgerAccountBalanceDto;
    entries: LedgerEntryDto[];
    generatedAt: string;
}
export declare class LedgerTransactionsResponseDto {
    source: 'api/finance/ledger/transactions';
    fromIso: string;
    toIso: string;
    totalEntries: number;
    entries: LedgerEntryDto[];
    generatedAt: string;
}
export declare class LedgerReconciliationUnbalancedDto {
    txId: string;
    debit: string;
    credit: string;
    delta: string;
}
export declare class LedgerReconciliationResponseDto {
    source: 'api/finance/ledger/reconciliation';
    status: 'PASS' | 'FAIL';
    fromIso: string;
    toIso: string;
    totalEntries: number;
    totalTransactions: number;
    globalDebit: string;
    globalCredit: string;
    unbalancedTransactions: LedgerReconciliationUnbalancedDto[];
    unattributedEntries: number;
    generatedAt: string;
}
