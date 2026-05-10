import { Prisma } from '@prisma/client';
import { DebtVisibilityService } from './debt-visibility.service';
import type { FinancialSnapshotRow } from '../snapshots/financial-snapshot.types';

const CUST = '11111111-1111-4111-8111-111111111111';
const COLD_CUST = '22222222-2222-4222-8222-222222222222';

function dec(s: string) {
  return new Prisma.Decimal(s);
}

function makeSnapshotRow(overrides: Partial<FinancialSnapshotRow> = {}) {
  const now = new Date();
  return {
    id: 'snap-1',
    customerId: CUST,
    journalArBalanceKd: dec('170.0000'),
    remainingDebtKd: dec('170.0000'),
    paidTotalKd: dec('30.0000'),
    totalInvoicesKd: dec('200.0000'),
    walletBalanceKd: dec('5.0000'),
    walletLiabilityKd: dec('12.0000'),
    unpaidInvoicesCount: 1,
    partiallyPaidInvoicesCount: 1,
    activeInvoicesCount: 2,
    overdueInvoicesCount: 1,
    lastPaymentAt: now,
    lastInvoiceAt: now,
    canonicalSource: 'PARTIAL_PAYMENT_REMAINING' as const,
    v20_3TrueAccountingActive: false,
    schemaVersion: 1,
    refreshedAt: now,
    createdAt: now,
    updatedAt: now,
    refreshContext: null,
    ...overrides,
  };
}

function makeSnapshotsService(initial: FinancialSnapshotRow | null) {
  let row = initial;
  return {
    getOrBuildForCustomer: jest.fn(async () => {
      if (!row) throw new Error('no projection');
      return row;
    }),
    findExistingByCustomerIds: jest.fn(async (ids: string[]) => {
      const m = new Map<string, FinancialSnapshotRow>();
      if (row && ids.includes(row.customerId)) m.set(row.customerId, row);
      return m;
    }),
    refreshOne: jest.fn(async () => row),
    setRow(next: FinancialSnapshotRow | null) {
      row = next;
    },
  };
}

function makePrisma() {
  return {
    customerSubscription: {
      findFirst: jest.fn(async () => null),
    },
    order: { findUnique: jest.fn() },
    debtLedgerEntry: { findMany: jest.fn(async () => []) },
    financialSnapshot: {
      aggregate: jest.fn(async () => ({
        _sum: { remainingDebtKd: dec('1234.0000') },
        _count: { _all: 7 },
      })),
    },
  };
}

function makeJournalSource() {
  return {
    getCustomerArSnapshot: jest.fn(async () => ({
      arBalanceKd: dec('0'),
      walletLiabilityKd: dec('0'),
    })),
    getCustomerDebtFromJournalAR: jest.fn(async () => dec('0')),
  };
}

describe('DebtVisibilityService', () => {
  it('returns the canonical view from the read-side projection', async () => {
    const snap = makeSnapshotsService(makeSnapshotRow());
    const svc = new DebtVisibilityService(
      makePrisma() as never,
      snap as never,
      makeJournalSource() as never,
    );
    const v = await svc.getCustomerVisibleDebt(CUST);
    expect(v.customerId).toBe(CUST);
    expect(v.fromSnapshot).toBe(true);
    expect(v.remainingDebtKd).toBe('170.0000');
    expect(v.partiallyPaidInvoicesCount).toBe(1);
    expect(v.unpaidInvoicesCount).toBe(1);
    expect(v.hasDebt).toBe(true);
  });

  it('falls back to live computation when the projection build fails', async () => {
    const snap = makeSnapshotsService(null);
    snap.getOrBuildForCustomer.mockRejectedValueOnce(new Error('boom'));
    const journal = makeJournalSource();
    journal.getCustomerDebtFromJournalAR.mockResolvedValueOnce(dec('42.0000'));
    const prisma = makePrisma();
    // make the canonical helper return 42 by stubbing the order/ledger
    // surfaces it touches; the helper is wrapped inside the service so
    // we only need the journal stub for the fallback path.
    const svc = new DebtVisibilityService(
      prisma as never,
      snap as never,
      journal as never,
    );
    // Inject a stub for the canonical-helper internal call by spying
    // on the private method via prototype.
    const live = jest
      .spyOn(svc as unknown as { computeVisibleDebtLive: () => Promise<unknown> }, 'computeVisibleDebtLive')
      .mockResolvedValue({
        customerId: CUST,
        remainingDebtKd: '42.0000',
        paidTotalKd: '0.0000',
        totalInvoicesKd: '0.0000',
        journalArBalanceKd: '42.0000',
        walletLiabilityKd: '0.0000',
        walletBalanceKd: '0.0000',
        unpaidInvoicesCount: 0,
        partiallyPaidInvoicesCount: 0,
        activeInvoicesCount: 0,
        overdueInvoicesCount: 0,
        hasDebt: true,
        lastPaymentAt: null,
        lastInvoiceAt: null,
        canonicalSource: 'JOURNAL_AR_FALLBACK',
        fromSnapshot: false,
        snapshotRefreshedAt: null,
      });

    const v = await svc.getCustomerVisibleDebt(CUST);
    expect(live).toHaveBeenCalled();
    expect(v.fromSnapshot).toBe(false);
    expect(v.remainingDebtKd).toBe('42.0000');
  });

  it('batch path mixes snapshot rows and live fallback', async () => {
    const snap = makeSnapshotsService(makeSnapshotRow());
    const svc = new DebtVisibilityService(
      makePrisma() as never,
      snap as never,
      makeJournalSource() as never,
    );
    jest
      .spyOn(svc as unknown as { computeVisibleDebtLive: () => Promise<unknown> }, 'computeVisibleDebtLive')
      .mockResolvedValue({
        customerId: COLD_CUST,
        remainingDebtKd: '0.0000',
        paidTotalKd: '0.0000',
        totalInvoicesKd: '0.0000',
        journalArBalanceKd: '0.0000',
        walletLiabilityKd: '0.0000',
        walletBalanceKd: '0.0000',
        unpaidInvoicesCount: 0,
        partiallyPaidInvoicesCount: 0,
        activeInvoicesCount: 0,
        overdueInvoicesCount: 0,
        hasDebt: false,
        lastPaymentAt: null,
        lastInvoiceAt: null,
        canonicalSource: 'JOURNAL_AR_FALLBACK',
        fromSnapshot: false,
        snapshotRefreshedAt: null,
      });
    const out = await svc.getCustomerVisibleDebtBatch([CUST, COLD_CUST]);
    expect(out.size).toBe(2);
    expect(out.get(CUST)?.fromSnapshot).toBe(true);
    expect(out.get(COLD_CUST)?.fromSnapshot).toBe(false);
  });

  it('collections snapshot reads from the projection table', async () => {
    const snap = makeSnapshotsService(makeSnapshotRow());
    const prisma = makePrisma();
    const svc = new DebtVisibilityService(
      prisma as never,
      snap as never,
      makeJournalSource() as never,
    );
    const k = await svc.getCollectionsSnapshot();
    expect(k.totalRemainingDebtKd).toBe('1234.0000');
    expect(k.customersWithDebt).toBe(7);
  });
});
