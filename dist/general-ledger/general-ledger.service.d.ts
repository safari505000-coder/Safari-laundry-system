import { GeneralLedgerEntryType, Prisma } from '@prisma/client';
export type AppendLedgerInput = {
    entryType: GeneralLedgerEntryType;
    amount: Prisma.Decimal | string | number;
    memo?: string | null;
    metadata?: Prisma.InputJsonValue;
    customerId?: string | null;
    orderId?: string | null;
    expenseId?: string | null;
    actorUserId?: string | null;
};
export declare class GeneralLedgerService {
    append(tx: Prisma.TransactionClient, row: AppendLedgerInput): Prisma.Prisma__GeneralLedgerEntryClient<{
        id: string;
        entryType: import("@prisma/client").$Enums.GeneralLedgerEntryType;
        amount: Prisma.Decimal;
        memo: string | null;
        metadata: Prisma.JsonValue | null;
        customerId: string | null;
        orderId: string | null;
        expenseId: string | null;
        actorUserId: string | null;
        createdAt: Date;
    }, never, import("@prisma/client/runtime/client").DefaultArgs, Prisma.PrismaClientOptions>;
}
