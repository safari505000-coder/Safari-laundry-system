import { GeneralLedgerEntryType, Prisma } from "@prisma/client";
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
        metadata: Prisma.JsonValue | null;
        amount: Prisma.Decimal;
        id: string;
        createdAt: Date;
        customerId: string | null;
        actorUserId: string | null;
        orderId: string | null;
        entryType: import(".prisma/client").$Enums.GeneralLedgerEntryType;
        memo: string | null;
        expenseId: string | null;
    }, never, import("@prisma/client/runtime/client").DefaultArgs, Prisma.PrismaClientOptions>;
}
