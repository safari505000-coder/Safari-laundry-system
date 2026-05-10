/**
 * V20.1-v4 — Phase 16 circuit breaker spec.
 *
 * Verifies that mirrorDebtLedgerEntrySafe:
 *   1) NEVER rethrows a journal-side error on the first few failures
 *   2) persists every failure to JournalFailureLog
 *   3) trips CriticalJournalFailureError once recent failure count
 *      for the same customer exceeds the threshold
 */
import { DebtSource, Prisma } from '@prisma/client';
import {
  CRITICAL_FAILURE_THRESHOLD,
  CriticalJournalFailureError,
  DoubleEntryJournalService,
} from './double-entry-journal.service';

const customerId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '22222222-2222-4222-8222-222222222222';

function makePrismaWithFailureCount(initialCount: number, txDb: Record<string, unknown>) {
  return {
    journalFailureLog: {
      create: jest.fn().mockResolvedValue({ id: 'failure-1' }),
      count: jest.fn().mockResolvedValue(initialCount),
    },
    ...txDb,
  };
}

function makeFailingTxDb() {
  return {
    journalEntry: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockRejectedValue(new Error('DB_TIMEOUT')),
    },
    account: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'account-1100', code: '1100' },
        { id: 'account-1300', code: '1300' },
      ]),
    },
  };
}

describe('V20.1-v4 — Phase 16 circuit breaker', () => {
  it('first failure: logs, persists, does NOT throw', async () => {
    const txDb = makeFailingTxDb();
    const prisma = makePrismaWithFailureCount(0, txDb);
    const service = new DoubleEntryJournalService(prisma as never);

    const result = await service.mirrorDebtLedgerEntrySafe(txDb as never, {
      source: DebtSource.PAYMENT,
      amount: '5.0000',
      sourceRef: 'PAYMENT:CASH:test',
      actorUserId,
      customerId,
    });

    expect(result).toBeNull();
    expect(prisma.journalFailureLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.journalFailureLog.create.mock.calls[0][0].data).toMatchObject({
      customerId,
      sourceRef: 'PAYMENT:CASH:test',
      errorMessage: expect.stringContaining('DB_TIMEOUT'),
    });
  });

  it('threshold+1 failures: throws CriticalJournalFailureError', async () => {
    const txDb = makeFailingTxDb();
    const prisma = makePrismaWithFailureCount(
      CRITICAL_FAILURE_THRESHOLD + 1, // count includes the just-persisted row
      txDb,
    );
    const service = new DoubleEntryJournalService(prisma as never);

    await expect(
      service.mirrorDebtLedgerEntrySafe(txDb as never, {
        source: DebtSource.PAYMENT,
        amount: '5.0000',
        sourceRef: 'PAYMENT:CASH:tripping',
        actorUserId,
        customerId,
      }),
    ).rejects.toBeInstanceOf(CriticalJournalFailureError);
  });

  it('persist failure does NOT propagate (degraded DB scenario)', async () => {
    const txDb = makeFailingTxDb();
    const prisma = {
      ...makePrismaWithFailureCount(0, txDb),
      journalFailureLog: {
        create: jest.fn().mockRejectedValue(new Error('PERSIST_FAILED')),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new DoubleEntryJournalService(prisma as never);

    const result = await service.mirrorDebtLedgerEntrySafe(txDb as never, {
      source: DebtSource.PAYMENT,
      amount: '5.0000',
      sourceRef: 'PAYMENT:CASH:degraded',
      actorUserId,
      customerId,
    });

    expect(result).toBeNull();
    // Should NOT throw — even when persistence itself fails.
  });

  it('V20.2 — appendWalletAbsorptionEntrySafe writes DR WALLET_LIABILITY (2100) / CR REVENUE (4100)', async () => {
    const txDb = {
      journalEntry: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'journal-wa-1' }),
      },
      account: {
        findMany: jest.fn().mockResolvedValue([
          // V20.2 — Phase 27 swaps the v4 5100 placeholder for the
          // dedicated 2100 WALLET_LIABILITY account.
          { id: 'account-2100', code: '2100' },
          { id: 'account-4100', code: '4100' },
        ]),
      },
    };
    const prisma = makePrismaWithFailureCount(0, txDb);
    const service = new DoubleEntryJournalService(prisma as never);

    const result = await service.appendWalletAbsorptionEntrySafe(
      txDb as never,
      {
        customerId,
        orderId: 'order-1',
        actorUserId,
        amount: new Prisma.Decimal('5.0000'),
      },
    );

    expect(result).toEqual({ id: 'journal-wa-1' });
    const createArg = txDb.journalEntry.create.mock.calls[0][0];
    expect(createArg.data.source).toBe('WALLET_ABSORPTION');
    expect(createArg.data.sourceRef).toBe(
      'JOURNAL:WALLET_ABSORPTION:order-1:APPLIED',
    );
    expect(createArg.data.lines.create).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: 'account-2100',
          debit: expect.objectContaining({ toString: expect.any(Function) }),
        }),
        expect.objectContaining({
          accountId: 'account-4100',
          credit: expect.objectContaining({ toString: expect.any(Function) }),
        }),
      ]),
    );
    // Negative-test: must NOT touch ADJUSTMENTS (5100) anymore.
    const accountIdsRequested =
      txDb.account.findMany.mock.calls[0][0].where.code.in;
    expect(accountIdsRequested).toEqual(['2100', '4100']);
  });
});
