import { Prisma } from '@prisma/client';
import {
  DoubleEntryJournalService,
  JOURNAL_ACCOUNTS,
} from './double-entry-journal.service';
import { FinancialTransactionProcessorService } from './financial-transaction-processor.service';

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

describe('FinancialTransactionProcessorService', () => {
  const actorUserId = '11111111-1111-4111-8111-111111111111';
  const customerId = '22222222-2222-4222-8222-222222222222';

  function makeService() {
    return new FinancialTransactionProcessorService(
      new DoubleEntryJournalService({} as never),
    );
  }

  it('posts subscription with subsidy as cash + promotional expense against customer ledger', async () => {
    const db = mockDb();

    const result = await makeService().processTransaction(db as never, {
      transactionType: 'RENEWAL',
      referenceType: 'SUBSCRIPTION',
      referenceId: 'sub-1',
      actorUserId,
      customerId,
      customerLedgerCreditKd: '25.0000',
      fundingSources: [
        { kind: 'PAYMENT', paymentMethod: 'CASH', amountKd: '20.0000' },
        { kind: 'SUBSIDY', amountKd: '5.0000' },
      ],
    });

    expect(result.totalDebitKd).toBe('25.0000');
    expect(result.totalCreditKd).toBe('25.0000');
    const createArg = db.journalEntry.create.mock.calls[0][0];
    expect(createArg.data.source).toBe('PROCESS_TRANSACTION');
    expect(createArg.data.sourceRef).toBe(
      'PROCESS_TRANSACTION:RENEWAL:SUBSCRIPTION:sub-1',
    );
    expect(createArg.data.lines.create).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: `account-${JOURNAL_ACCOUNTS.CASH}`,
          debit: new Prisma.Decimal('20.0000'),
          meta: expect.objectContaining({
            transaction_type: 'PAYMENT',
            payment_method: 'CASH',
            reference_id: 'sub-1',
          }),
        }),
        expect.objectContaining({
          accountId: `account-${JOURNAL_ACCOUNTS.PROMOTIONAL_EXPENSE}`,
          debit: new Prisma.Decimal('5.0000'),
          meta: expect.objectContaining({
            transaction_type: 'SUBSIDY',
            is_refundable: false,
            fraud_control: 'SUBSIDY_NO_CASH_OUT',
          }),
        }),
        expect.objectContaining({
          accountId: `account-${JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE}`,
          credit: new Prisma.Decimal('25.0000'),
          meta: expect.objectContaining({
            transaction_type: 'RENEWAL',
            reference_type: 'SUBSCRIPTION',
            reference_id: 'sub-1',
          }),
        }),
      ]),
    );
  });

  it('posts invoice discount as cash plus discounts allowed against full customer ledger reduction', async () => {
    const db = mockDb();

    await makeService().processTransaction(db as never, {
      transactionType: 'DISCOUNT',
      referenceType: 'INVOICE',
      referenceId: 'invoice-1',
      actorUserId,
      customerId,
      orderId: 'invoice-1',
      customerLedgerCreditKd: '30.2500',
      fundingSources: [
        { kind: 'PAYMENT', paymentMethod: 'KNET', amountKd: '25.0000' },
        { kind: 'DISCOUNT', amountKd: '5.2500' },
      ],
    });

    const lines = db.journalEntry.create.mock.calls[0][0].data.lines.create;
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: `account-${JOURNAL_ACCOUNTS.BANK_KNET}`,
          debit: new Prisma.Decimal('25.0000'),
        }),
        expect.objectContaining({
          accountId: `account-${JOURNAL_ACCOUNTS.DEBT_DISCOUNTS}`,
          debit: new Prisma.Decimal('5.2500'),
          meta: expect.objectContaining({ is_refundable: false }),
        }),
        expect.objectContaining({
          accountId: `account-${JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE}`,
          credit: new Prisma.Decimal('30.2500'),
        }),
      ]),
    );
  });

  it('rejects unbalanced funding totals before writing a journal entry', async () => {
    const db = mockDb();

    await expect(
      makeService().processTransaction(db as never, {
        transactionType: 'PAYMENT',
        referenceType: 'INVOICE',
        referenceId: 'invoice-2',
        actorUserId,
        customerId,
        customerLedgerCreditKd: '30.0000',
        fundingSources: [
          { kind: 'PAYMENT', paymentMethod: 'ONLINE', amountKd: '25.0000' },
        ],
      }),
    ).rejects.toThrow('PROCESS_TRANSACTION_UNBALANCED');
    expect(db.journalEntry.create).not.toHaveBeenCalled();
  });

  it('maps DEBT payment method strictly to customer ledger account', async () => {
    const db = mockDb();

    await makeService().processTransaction(db as never, {
      transactionType: 'PAYMENT',
      referenceType: 'CUSTOMER',
      referenceId: customerId,
      actorUserId,
      customerId,
      customerLedgerCreditKd: '10.0000',
      fundingSources: [
        { kind: 'PAYMENT', paymentMethod: 'DEBT', amountKd: '10.0000' },
      ],
    });

    const lines = db.journalEntry.create.mock.calls[0][0].data.lines.create;
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: `account-${JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE}`,
          debit: new Prisma.Decimal('10.0000'),
        }),
        expect.objectContaining({
          accountId: `account-${JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE}`,
          credit: new Prisma.Decimal('10.0000'),
        }),
      ]),
    );
  });
});
