import { DebtSource, PosPaymentMethod, Prisma } from "@prisma/client";
import { PrismaService } from '../prisma/prisma.service';
export declare const JOURNAL_ACCOUNTS: {
    readonly CASH: "1100";
    readonly BANK_KNET: "1200";
    readonly BANK_ONLINE: "1210";
    readonly ACCOUNTS_RECEIVABLE: "1300";
    readonly REVENUE: "4100";
    readonly ADJUSTMENTS: "5100";
};
type Db = PrismaService | Prisma.TransactionClient;
type JournalLineInput = {
    accountCode: string;
    debit?: Prisma.Decimal | string | number;
    credit?: Prisma.Decimal | string | number;
    meta?: Prisma.InputJsonValue;
};
type AppendJournalInput = {
    source: string;
    sourceRef: string;
    actorUserId: string;
    customerId?: string | null;
    orderId?: string | null;
    lines: JournalLineInput[];
};
type MirrorDebtLedgerInput = {
    source: DebtSource | string;
    amount: Prisma.Decimal | string | number;
    sourceRef?: string | null;
    actorUserId?: string | null;
    customerId: string;
    orderId?: string | null;
    paymentMethod?: PosPaymentMethod | string | null;
    note?: string | null;
};
export type JournalStatementRow = {
    entryId: string;
    date: string;
    description: string;
    debit: string;
    credit: string;
    balance: string;
};
export declare class DoubleEntryJournalService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    appendBalanced(db: Db, input: AppendJournalInput): Promise<{
        id: string;
    }>;
    mirrorDebtLedgerEntry(db: Db, input: MirrorDebtLedgerInput): Promise<{
        id: string;
    } | null>;
    getCustomerBalanceFromJournal(customerId: string): Promise<Prisma.Decimal>;
    logCustomerDrift(customerId: string, ledgerBalance: Prisma.Decimal | string | number): Promise<void>;
    getCustomerStatement(customerId: string): Promise<{
        balance: string;
        rows: JournalStatementRow[];
    }>;
    private paymentAssetAccount;
    private decimal;
}
export {};
