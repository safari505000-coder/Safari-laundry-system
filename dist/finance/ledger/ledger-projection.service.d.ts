import { PrismaService } from '../../prisma/prisma.service';
export type LedgerEntry = {
    txId: string;
    id: string;
    accountId: string;
    debit: string;
    credit: string;
    createdAt: string;
    meta: Record<string, unknown>;
};
export type AccountBalanceRow = {
    accountId: string;
    totalDebit: string;
    totalCredit: string;
    balance: string;
    entryCount: number;
};
export type ReconciliationReport = {
    status: 'PASS' | 'FAIL';
    fromIso: string;
    toIso: string;
    totalEntries: number;
    totalTransactions: number;
    globalDebit: string;
    globalCredit: string;
    unbalancedTransactions: Array<{
        txId: string;
        debit: string;
        credit: string;
        delta: string;
    }>;
    unattributedEntries: number;
    generatedAt: string;
};
export type LedgerProjectionInput = {
    fromIso: string;
    toIso: string;
};
export declare class LedgerProjectionService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    project(input: LedgerProjectionInput): Promise<LedgerEntry[]>;
    aggregateAccounts(entries: LedgerEntry[]): AccountBalanceRow[];
    reconcile(entries: LedgerEntry[], fromIso: string, toIso: string): ReconciliationReport;
}
