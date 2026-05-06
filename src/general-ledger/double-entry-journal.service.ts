import { Injectable } from '@nestjs/common';
import { DebtSource, PosPaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const JOURNAL_ACCOUNTS = {
  CASH: '1100',
  BANK_KNET: '1200',
  BANK_ONLINE: '1210',
  ACCOUNTS_RECEIVABLE: '1300',
  REVENUE: '4100',
  ADJUSTMENTS: '5100',
} as const;

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

@Injectable()
export class DoubleEntryJournalService {
  constructor(private readonly prisma: PrismaService) {}

  async appendBalanced(
    db: Db,
    input: AppendJournalInput,
  ): Promise<{ id: string }> {
    if (!input.actorUserId) throw new Error('JOURNAL_ACTOR_REQUIRED');
    if (!input.sourceRef?.trim()) throw new Error('JOURNAL_SOURCE_REF_REQUIRED');
    if (input.lines.length < 2) throw new Error('JOURNAL_MINIMUM_TWO_LINES');

    const existing = await db.journalEntry.findUnique({
      where: { sourceRef: input.sourceRef },
      select: { id: true },
    });
    if (existing) return existing;

    const normalized = input.lines.map((line) => ({
      ...line,
      debit: this.decimal(line.debit ?? 0),
      credit: this.decimal(line.credit ?? 0),
    }));

    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);
    for (const line of normalized) {
      if (line.debit.lessThan(0) || line.credit.lessThan(0)) {
        throw new Error('NEGATIVE_JOURNAL_LINE');
      }
      if (line.debit.gt(0) && line.credit.gt(0)) {
        throw new Error('AMBIGUOUS_JOURNAL_LINE');
      }
      if (line.debit.equals(0) && line.credit.equals(0)) {
        throw new Error('EMPTY_JOURNAL_LINE');
      }
      totalDebit = totalDebit.add(line.debit);
      totalCredit = totalCredit.add(line.credit);
    }

    if (totalDebit.sub(totalCredit).abs().gt(new Prisma.Decimal('0.001'))) {
      throw new Error('UNBALANCED_JOURNAL');
    }

    const accounts = await db.account.findMany({
      where: {
        code: { in: normalized.map((line) => line.accountCode) },
        isActive: true,
      },
      select: { id: true, code: true },
    });
    const accountIdByCode = new Map(accounts.map((a) => [a.code, a.id]));
    for (const line of normalized) {
      if (!accountIdByCode.has(line.accountCode)) {
        throw new Error(`JOURNAL_ACCOUNT_NOT_FOUND:${line.accountCode}`);
      }
    }

    return db.journalEntry.create({
      data: {
        source: input.source,
        sourceRef: input.sourceRef,
        actorUserId: input.actorUserId,
        customerId: input.customerId ?? null,
        orderId: input.orderId ?? null,
        lines: {
          create: normalized.map((line) => ({
            accountId: accountIdByCode.get(line.accountCode)!,
            debit: line.debit,
            credit: line.credit,
            ...(line.meta !== undefined ? { meta: line.meta } : {}),
          })),
        },
      },
      select: { id: true },
    });
  }

  async mirrorDebtLedgerEntry(
    db: Db,
    input: MirrorDebtLedgerInput,
  ): Promise<{ id: string } | null> {
    if (!input.actorUserId) throw new Error('JOURNAL_ACTOR_REQUIRED');
    const amount = this.decimal(input.amount);
    if (amount.lessThanOrEqualTo(0)) return null;

    const sourceRef =
      input.sourceRef?.trim() ||
      `JOURNAL:${input.source}:${input.customerId}:${input.orderId ?? 'CUSTOMER'}:${Date.now()}`;

    if (input.source === DebtSource.PAYMENT || input.source === 'PAYMENT') {
      const assetAccount = this.paymentAssetAccount(input);
      const isAdjustment = assetAccount === JOURNAL_ACCOUNTS.ADJUSTMENTS;
      return this.appendBalanced(db, {
        source: isAdjustment ? 'ADJUSTMENT' : 'PAYMENT',
        sourceRef,
        actorUserId: input.actorUserId,
        customerId: input.customerId,
        orderId: input.orderId ?? null,
        lines: [
          {
            accountCode: assetAccount,
            debit: amount,
            meta: { note: input.note ?? null },
          },
          {
            accountCode: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
            credit: amount,
            meta: { debtSource: input.source },
          },
        ],
      });
    }

    if (
      input.source === DebtSource.INVOICE_SHORTFALL ||
      input.source === DebtSource.SUBSCRIPTION_OVERUSE ||
      input.source === 'INVOICE_SHORTFALL' ||
      input.source === 'SUBSCRIPTION_OVERUSE'
    ) {
      return this.appendBalanced(db, {
        source: 'INVOICE',
        sourceRef,
        actorUserId: input.actorUserId,
        customerId: input.customerId,
        orderId: input.orderId ?? null,
        lines: [
          {
            accountCode: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
            debit: amount,
            meta: { debtSource: input.source },
          },
          {
            accountCode: JOURNAL_ACCOUNTS.REVENUE,
            credit: amount,
            meta: { note: input.note ?? null },
          },
        ],
      });
    }

    return null;
  }

  async getCustomerBalanceFromJournal(
    customerId: string,
  ): Promise<Prisma.Decimal> {
    const rows = await this.prisma.journalLine.findMany({
      where: {
        entry: { customerId },
        account: { code: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE },
      },
      select: { debit: true, credit: true },
    });
    return rows.reduce(
      (sum, row) => sum.add(row.debit).sub(row.credit),
      new Prisma.Decimal(0),
    );
  }

  async logCustomerDrift(
    customerId: string,
    ledgerBalance: Prisma.Decimal | string | number,
  ): Promise<void> {
    const journalBalance = await this.getCustomerBalanceFromJournal(customerId);
    const ledger = this.decimal(ledgerBalance);
    if (ledger.sub(journalBalance).abs().gt(new Prisma.Decimal('0.001'))) {
      console.error('[JOURNAL_DRIFT]', {
        customerId,
        ledgerBalance: ledger.toFixed(4),
        journalBalance: journalBalance.toFixed(4),
      });
    }
  }

  async getCustomerStatement(
    customerId: string,
  ): Promise<{ balance: string; rows: JournalStatementRow[] }> {
    const lines = await this.prisma.journalLine.findMany({
      where: {
        entry: { customerId },
        account: { code: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE },
      },
      orderBy: [{ entry: { createdAt: 'asc' } }, { id: 'asc' }],
      select: {
        debit: true,
        credit: true,
        entry: { select: { id: true, source: true, sourceRef: true, createdAt: true } },
      },
    });

    let balance = new Prisma.Decimal(0);
    const rows = lines.map((line) => {
      balance = balance.add(line.debit).sub(line.credit);
      return {
        entryId: line.entry.id,
        date: line.entry.createdAt.toISOString(),
        description: `${line.entry.source} ${line.entry.sourceRef}`,
        debit: line.debit.toFixed(4),
        credit: line.credit.toFixed(4),
        balance: balance.toFixed(4),
      };
    });

    return { balance: balance.toFixed(4), rows };
  }

  private paymentAssetAccount(input: MirrorDebtLedgerInput): string {
    const ref = input.sourceRef ?? '';
    const method = input.paymentMethod ?? '';
    const note = input.note?.toLowerCase() ?? '';
    if (ref.includes(':KNET:') || method === PosPaymentMethod.KNET) {
      return JOURNAL_ACCOUNTS.BANK_KNET;
    }
    if (
      ref.includes(':ONLINE:') ||
      ref.includes(':PAYMENT_LINK:') ||
      method === PosPaymentMethod.ONLINE ||
      method === PosPaymentMethod.PAYMENT_LINK
    ) {
      return JOURNAL_ACCOUNTS.BANK_ONLINE;
    }
    if (ref.includes(':CASH:') || method === PosPaymentMethod.CASH) {
      return JOURNAL_ACCOUNTS.CASH;
    }
    if (ref.startsWith('ADJUSTMENT:') || note.includes('void') || note.includes('edit')) {
      return JOURNAL_ACCOUNTS.ADJUSTMENTS;
    }
    return JOURNAL_ACCOUNTS.CASH;
  }

  private decimal(value: Prisma.Decimal | string | number): Prisma.Decimal {
    return value instanceof Prisma.Decimal
      ? value
      : new Prisma.Decimal(value.toString());
  }
}
