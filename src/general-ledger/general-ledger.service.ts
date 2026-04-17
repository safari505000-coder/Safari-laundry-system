import { Injectable } from '@nestjs/common';
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

@Injectable()
export class GeneralLedgerService {
  append(tx: Prisma.TransactionClient, row: AppendLedgerInput) {
    const dec =
      typeof row.amount === 'object' &&
      row.amount !== null &&
      'toFixed' in row.amount
        ? (row.amount as Prisma.Decimal)
        : new Prisma.Decimal(String(row.amount));
    return tx.generalLedgerEntry.create({
      data: {
        entryType: row.entryType,
        amount: dec,
        memo: row.memo ?? null,
        ...(row.metadata !== undefined ? { metadata: row.metadata } : {}),
        customerId: row.customerId ?? null,
        orderId: row.orderId ?? null,
        expenseId: row.expenseId ?? null,
        actorUserId: row.actorUserId ?? null,
      },
    });
  }
}
