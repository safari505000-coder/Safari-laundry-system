import { Prisma } from '@prisma/client';
import { DoubleEntryJournalService, JOURNAL_ACCOUNTS } from './double-entry-journal.service';

/**
 * V22 Phase 6 — full balanced double-entry per customer.
 *
 * The legacy `getCustomerStatement` endpoint projects only the
 * AR slice (one row per AR-side line). Operators kept asking
 * "where is the matching double-entry?" because they only saw
 * one side. This spec locks in the new
 * `getCustomerJournalEntries` projection: every entry returned
 * is fully balanced, exposes BOTH sides with account code +
 * name, and reports a per-entry trial-balance check so the UI
 * can flag the (impossible) case where a stored entry is not
 * balanced.
 *
 * The test uses a hand-rolled Prisma mock — no real DB, no FS
 * touch — and runs in <50ms.
 */

type FakeEntry = {
  id: string;
  source: string;
  sourceRef: string;
  createdAt: Date;
  lines: Array<{
    debit: Prisma.Decimal;
    credit: Prisma.Decimal;
    account: { code: string; name: string };
    meta?: Prisma.JsonValue;
  }>;
};

function makeFakePrisma(entries: FakeEntry[]) {
  return {
    journalEntry: {
      findMany: jest.fn().mockImplementation(async () => entries),
    },
    customerSubscription: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

describe('V22 Phase 6 — getCustomerJournalEntries', () => {
  const customerId = '11111111-1111-4111-8111-111111111111';

  it('returns each entry with both sides and a trial-balance check', async () => {
    const fakeEntries: FakeEntry[] = [
      {
        id: 'entry-invoice',
        source: 'INVOICE',
        sourceRef: 'INVOICE:order-1',
        createdAt: new Date('2026-05-09T03:00:00.000Z'),
        lines: [
          {
            debit: new Prisma.Decimal('35.0000'),
            credit: new Prisma.Decimal('0'),
            account: { code: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE, name: 'ACCOUNTS_RECEIVABLE' },
          },
          {
            debit: new Prisma.Decimal('0'),
            credit: new Prisma.Decimal('35.0000'),
            account: { code: JOURNAL_ACCOUNTS.REVENUE, name: 'REVENUE' },
          },
        ],
      },
      {
        id: 'entry-payment',
        source: 'PAYMENT',
        sourceRef: 'PAYMENT:CASH:residual-1',
        createdAt: new Date('2026-05-09T04:00:00.000Z'),
        lines: [
          {
            debit: new Prisma.Decimal('25.0000'),
            credit: new Prisma.Decimal('0'),
            account: { code: JOURNAL_ACCOUNTS.CASH, name: 'CASH' },
          },
          {
            debit: new Prisma.Decimal('0'),
            credit: new Prisma.Decimal('25.0000'),
            account: { code: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE, name: 'ACCOUNTS_RECEIVABLE' },
          },
        ],
      },
    ];
    const prisma = makeFakePrisma(fakeEntries);
    const svc = new DoubleEntryJournalService(prisma as never);

    const out = await svc.getCustomerJournalEntries(customerId);

    expect(out.customerId).toBe(customerId);
    expect(out.entries).toHaveLength(2);

    const invoice = out.entries[0];
    expect(invoice.entryId).toBe('entry-invoice');
    expect(invoice.source).toBe('INVOICE');
    expect(invoice.referenceLabel.length).toBeGreaterThan(0);
    expect(invoice.balanced).toBe(true);
    expect(invoice.totalDebitKd).toBe('35.0000');
    expect(invoice.totalCreditKd).toBe('35.0000');
    expect(invoice.lines).toEqual([
      {
        accountCode: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
        accountName: 'ACCOUNTS_RECEIVABLE',
        debitKd: '35.0000',
        creditKd: '0.0000',
      },
      {
        accountCode: JOURNAL_ACCOUNTS.REVENUE,
        accountName: 'REVENUE',
        debitKd: '0.0000',
        creditKd: '35.0000',
      },
    ]);

    const payment = out.entries[1];
    expect(payment.entryId).toBe('entry-payment');
    expect(payment.source).toBe('PAYMENT');
    expect(payment.balanced).toBe(true);
    expect(payment.totalDebitKd).toBe('25.0000');
    expect(payment.totalCreditKd).toBe('25.0000');
    expect(payment.lines.map((l) => l.accountCode)).toEqual([
      JOURNAL_ACCOUNTS.CASH,
      JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
    ]);

    expect(prisma.journalEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId } }),
    );
  });

  it('flags an entry as not balanced when stored debits and credits drift (defence-in-depth)', async () => {
    const fakeEntries: FakeEntry[] = [
      {
        id: 'entry-broken',
        source: 'PAYMENT',
        sourceRef: 'PAYMENT:CASH:broken',
        createdAt: new Date('2026-05-09T05:00:00.000Z'),
        lines: [
          {
            debit: new Prisma.Decimal('10.0000'),
            credit: new Prisma.Decimal('0'),
            account: { code: JOURNAL_ACCOUNTS.CASH, name: 'CASH' },
          },
          {
            debit: new Prisma.Decimal('0'),
            credit: new Prisma.Decimal('9.5000'),
            account: { code: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE, name: 'ACCOUNTS_RECEIVABLE' },
          },
        ],
      },
    ];
    const prisma = makeFakePrisma(fakeEntries);
    const svc = new DoubleEntryJournalService(prisma as never);

    const out = await svc.getCustomerJournalEntries(customerId);

    expect(out.entries).toHaveLength(1);
    expect(out.entries[0].balanced).toBe(false);
    expect(out.entries[0].totalDebitKd).toBe('10.0000');
    expect(out.entries[0].totalCreditKd).toBe('9.5000');
  });

  it('returns an empty list for a customer with no journal activity', async () => {
    const prisma = makeFakePrisma([]);
    const svc = new DoubleEntryJournalService(prisma as never);

    const out = await svc.getCustomerJournalEntries(customerId);

    expect(out).toEqual({ customerId, entries: [] });
  });

  it('enriches contextLabel with subscription plan + payment channel when resolvable', async () => {
    const subId = '761c27db-3284-42bc-82d5-fdf3c24c336d';
    const fakeEntries: FakeEntry[] = [
      {
        id: 'entry-fund',
        source: 'PROCESS_TRANSACTION',
        sourceRef: `WALLET_FUNDING:SUBSCRIPTION:${subId}`,
        createdAt: new Date('2026-05-12T08:53:16.000Z'),
        lines: [
          {
            debit: new Prisma.Decimal('20.0000'),
            credit: new Prisma.Decimal('0'),
            account: {
              code: JOURNAL_ACCOUNTS.BANK_ONLINE,
              name: 'BANK_ONLINE',
            },
            meta: { payment_method: 'ONLINE' },
          },
          {
            debit: new Prisma.Decimal('5.0000'),
            credit: new Prisma.Decimal('0'),
            account: {
              code: JOURNAL_ACCOUNTS.PROMOTIONAL_EXPENSE,
              name: 'PROMOTIONAL_EXPENSE',
            },
            meta: {},
          },
          {
            debit: new Prisma.Decimal('0'),
            credit: new Prisma.Decimal('25.0000'),
            account: {
              code: JOURNAL_ACCOUNTS.WALLET_LIABILITY,
              name: 'WALLET_LIABILITY',
            },
            meta: {},
          },
        ],
      },
    ];
    const prisma = {
      journalEntry: {
        findMany: jest.fn().mockResolvedValue(fakeEntries),
      },
      customerSubscription: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: subId, planNameSnapshot: 'ذهبي — سنوي' }]),
      },
    };
    const svc = new DoubleEntryJournalService(prisma as never);
    const out = await svc.getCustomerJournalEntries(customerId);
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0].contextLabel).toContain('ذهبي');
    expect(out.entries[0].contextLabel).toContain('الباقة:');
    expect(out.entries[0].contextLabel).toContain('الدفع:');
    expect(out.entries[0].contextLabel).toContain('أونلاين');
  });
});
