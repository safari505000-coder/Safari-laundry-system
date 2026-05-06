import { DebtSource, PosPaymentMethod, Prisma } from '@prisma/client';
import {
  DoubleEntryJournalService,
  JOURNAL_ACCOUNTS,
} from './double-entry-journal.service';

function mockDb() {
  const accountRows = Object.values(JOURNAL_ACCOUNTS).map((code) => ({
    id: `account-${code}`,
    code,
  }));
  return {
    account: {
      findMany: jest.fn().mockResolvedValue(accountRows),
    },
    journalEntry: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'journal-1' }),
    },
  };
}

describe('DoubleEntryJournalService', () => {
  const service = new DoubleEntryJournalService({} as never);
  const actorUserId = '11111111-1111-4111-8111-111111111111';
  const customerId = '22222222-2222-4222-8222-222222222222';

  it('rejects unbalanced entries', async () => {
    await expect(
      service.appendBalanced(mockDb() as never, {
        source: 'TEST',
        sourceRef: 'TEST:UNBALANCED',
        actorUserId,
        customerId,
        lines: [
          { accountCode: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE, debit: '1.0000' },
          { accountCode: JOURNAL_ACCOUNTS.REVENUE, credit: '0.5000' },
        ],
      }),
    ).rejects.toThrow('UNBALANCED_JOURNAL');
  });

  it('mirrors invoice debt as AR debit and revenue credit', async () => {
    const db = mockDb();
    await service.mirrorDebtLedgerEntry(db as never, {
      source: DebtSource.INVOICE_SHORTFALL,
      amount: new Prisma.Decimal('3.2500'),
      sourceRef: 'INVOICE:test',
      actorUserId,
      customerId,
    });

    const createArg = db.journalEntry.create.mock.calls[0][0];
    expect(createArg.data.source).toBe('INVOICE');
    expect(createArg.data.lines.create).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: `account-${JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE}`,
          debit: new Prisma.Decimal('3.2500'),
        }),
        expect.objectContaining({
          accountId: `account-${JOURNAL_ACCOUNTS.REVENUE}`,
          credit: new Prisma.Decimal('3.2500'),
        }),
      ]),
    );
  });

  it('mirrors KNET payment as bank debit and AR credit', async () => {
    const db = mockDb();
    await service.mirrorDebtLedgerEntry(db as never, {
      source: DebtSource.PAYMENT,
      amount: '0.5000',
      sourceRef: 'PAYMENT:KNET:test',
      actorUserId,
      customerId,
      paymentMethod: PosPaymentMethod.KNET,
    });

    const lines = db.journalEntry.create.mock.calls[0][0].data.lines.create;
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: `account-${JOURNAL_ACCOUNTS.BANK_KNET}`,
          debit: new Prisma.Decimal('0.5000'),
        }),
        expect.objectContaining({
          accountId: `account-${JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE}`,
          credit: new Prisma.Decimal('0.5000'),
        }),
      ]),
    );
  });

  it('mirrors void adjustments without using cash/bank accounts', async () => {
    const db = mockDb();
    await service.mirrorDebtLedgerEntry(db as never, {
      source: DebtSource.PAYMENT,
      amount: '0.5000',
      sourceRef: 'ADJUSTMENT:INVOICE_AUDIT_VOID:test',
      actorUserId,
      customerId,
      note: 'Debt reversed by invoice void / edit (supervisor)',
    });

    const lines = db.journalEntry.create.mock.calls[0][0].data.lines.create;
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: `account-${JOURNAL_ACCOUNTS.ADJUSTMENTS}`,
          debit: new Prisma.Decimal('0.5000'),
        }),
        expect.objectContaining({
          accountId: `account-${JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE}`,
          credit: new Prisma.Decimal('0.5000'),
        }),
      ]),
    );
  });

  it('requires actor on journal writes', async () => {
    await expect(
      service.mirrorDebtLedgerEntry(mockDb() as never, {
        source: DebtSource.PAYMENT,
        amount: '1.0000',
        sourceRef: 'PAYMENT:CASH:test',
        actorUserId: null,
        customerId,
      }),
    ).rejects.toThrow('JOURNAL_ACTOR_REQUIRED');
  });
});
