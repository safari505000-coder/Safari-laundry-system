import { PosPaymentMethod, Prisma } from '@prisma/client';
import { DebtSource } from '../finance/enums/debt-source.enum';
import {
  DoubleEntryJournalService,
  JOURNAL_ACCOUNTS,
  aggregateJournalEntryForBankColumns,
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

  it('rejects unknown payment methods instead of defaulting to cash', async () => {
    await expect(
      service.mirrorDebtLedgerEntry(mockDb() as never, {
        source: DebtSource.PAYMENT,
        amount: '1.0000',
        sourceRef: 'PAYMENT:UNKNOWN:test',
        actorUserId,
        customerId,
        paymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
      }),
    ).rejects.toThrow('UNKNOWN_PAYMENT_ASSET_ACCOUNT');
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

  it('requires deterministic sourceRef on debt-ledger mirror writes', async () => {
    await expect(
      service.mirrorDebtLedgerEntry(mockDb() as never, {
        source: DebtSource.PAYMENT,
        amount: '1.0000',
        actorUserId,
        customerId,
      }),
    ).rejects.toThrow('JOURNAL_SOURCE_REF_REQUIRED');
  });

  it('treats repeated sourceRef appendBalanced calls as idempotent', async () => {
    const db = mockDb();
    db.journalEntry.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'journal-1' });

    const input = {
      source: 'TEST',
      sourceRef: 'TEST:IDEMPOTENT',
      actorUserId,
      customerId,
      lines: [
        { accountCode: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE, debit: '1.0000' },
        { accountCode: JOURNAL_ACCOUNTS.REVENUE, credit: '1.0000' },
      ],
    };

    const first = await service.appendBalanced(db as never, input);
    const second = await service.appendBalanced(db as never, input);

    expect(first).toEqual({ id: 'journal-1' });
    expect(second).toEqual({ id: 'journal-1' });
    expect(db.journalEntry.create).toHaveBeenCalledTimes(1);
  });

  it('CORRUPT-4: mirrorDebtLedgerEntrySafe re-throws ConflictException from period lock', async () => {
    const db = mockDb();
    const { ConflictException: CE } = await import('@nestjs/common');
    db.journalEntry.create.mockRejectedValueOnce(
      new CE('Financial period 2026-03 is CLOSED — write rejected by PeriodLockGuard'),
    );
    await expect(
      service.mirrorDebtLedgerEntrySafe(db as never, {
        source: DebtSource.PAYMENT,
        amount: '1.0000',
        sourceRef: 'PAYMENT:CASH:period-lock-test',
        actorUserId,
        customerId,
        paymentMethod: PosPaymentMethod.CASH,
      }),
    ).rejects.toBeInstanceOf(CE);
    // Must NOT have been silently swallowed
    expect(db.journalEntry.create).toHaveBeenCalledTimes(1);
  });

  it('treats P2002 on sourceRef as idempotent success in safe mirror writes', async () => {
    const db = mockDb();
    const duplicate = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`sourceRef`)',
      {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['sourceRef'] },
      },
    );
    db.journalEntry.create.mockRejectedValueOnce(duplicate);
    db.journalEntry.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'journal-existing' });

    const result = await service.mirrorDebtLedgerEntrySafe(db as never, {
      source: DebtSource.PAYMENT,
      amount: '1.0000',
      sourceRef: 'PAYMENT:CASH:IDEMPOTENT',
      actorUserId,
      customerId,
      paymentMethod: PosPaymentMethod.CASH,
    });

    expect(result).toEqual({ id: 'journal-existing' });
    expect(db.journalEntry.create).toHaveBeenCalledTimes(1);
  });
});

describe('aggregateJournalEntryForBankColumns', () => {
  it('sums subscription-style wallet funding: cash + promo liability credit', () => {
    const lines = [
      {
        debit: new Prisma.Decimal('10.0000'),
        credit: new Prisma.Decimal(0),
        account: { code: JOURNAL_ACCOUNTS.CASH },
      },
      {
        debit: new Prisma.Decimal('5.0000'),
        credit: new Prisma.Decimal(0),
        account: { code: JOURNAL_ACCOUNTS.PROMOTIONAL_EXPENSE },
      },
      {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal('15.0000'),
        account: { code: JOURNAL_ACCOUNTS.WALLET_LIABILITY },
      },
    ];
    expect(aggregateJournalEntryForBankColumns(lines)).toEqual({
      customerPaidKd: '10.0000',
      companySupportKd: '5.0000',
      debtGoodwillDiscountKd: '0.0000',
      walletCreditKd: '15.0000',
      walletDebitKd: '0.0000',
      arDebitKd: '0.0000',
      arCreditKd: '0.0000',
    });
  });

  it('classifies KNET pay-in and AR credit on collection', () => {
    const lines = [
      {
        debit: new Prisma.Decimal('2.5000'),
        credit: new Prisma.Decimal(0),
        account: { code: JOURNAL_ACCOUNTS.BANK_KNET },
      },
      {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal('2.5000'),
        account: { code: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE },
      },
    ];
    expect(aggregateJournalEntryForBankColumns(lines)).toEqual({
      customerPaidKd: '2.5000',
      companySupportKd: '0.0000',
      debtGoodwillDiscountKd: '0.0000',
      walletCreditKd: '0.0000',
      walletDebitKd: '0.0000',
      arDebitKd: '0.0000',
      arCreditKd: '2.5000',
    });
  });

  it('wallet absorption: debit wallet, credit AR', () => {
    const lines = [
      {
        debit: new Prisma.Decimal('3.0000'),
        credit: new Prisma.Decimal(0),
        account: { code: JOURNAL_ACCOUNTS.WALLET_LIABILITY },
      },
      {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal('3.0000'),
        account: { code: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE },
      },
    ];
    expect(aggregateJournalEntryForBankColumns(lines)).toEqual({
      customerPaidKd: '0.0000',
      companySupportKd: '0.0000',
      debtGoodwillDiscountKd: '0.0000',
      walletCreditKd: '0.0000',
      walletDebitKd: '3.0000',
      arDebitKd: '0.0000',
      arCreditKd: '3.0000',
    });
  });

  it('surfaces CC goodwill debt discount on expense account 5200', () => {
    const lines = [
      {
        debit: new Prisma.Decimal('1.0000'),
        credit: new Prisma.Decimal(0),
        account: { code: JOURNAL_ACCOUNTS.DEBT_DISCOUNTS },
      },
      {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal('1.0000'),
        account: { code: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE },
      },
    ];
    expect(aggregateJournalEntryForBankColumns(lines)).toEqual({
      customerPaidKd: '0.0000',
      companySupportKd: '0.0000',
      debtGoodwillDiscountKd: '1.0000',
      walletCreditKd: '0.0000',
      walletDebitKd: '0.0000',
      arDebitKd: '0.0000',
      arCreditKd: '1.0000',
    });
  });
});
