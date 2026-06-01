/**
 * FINANCIAL HARDENING — regression suite.
 *
 * Proves the 13 KD drift class (and its neighbours) cannot recur:
 *   - Duplicate Payment / Deposit / Settlement  → idempotent, no double post
 *   - Journal Imbalance                          → hard-rejected
 *   - Invalid / Double Reversal                  → idempotent / guarded
 *   - Partial Failure Recovery                   → fail-closed rolls back
 *   - Queue Retry Scenarios                      → idempotent on retry
 *   - Concurrent Requests                        → P2002 recovery, no drift
 *
 * (Located under src/test because jest rootDir is `src`; the logical
 *  suite is "tests/regression/financial".)
 */
import { Prisma, PosPaymentMethod } from '@prisma/client';
import { DoubleEntryJournalService } from '../../../general-ledger/double-entry-journal.service';
import { FinancialIntegrityService } from '../../../financial-integrity/financial-integrity.service';

const customerId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '22222222-2222-4222-8222-222222222222';
const orderId = '33333333-3333-4333-8333-333333333333';
const FLAG = 'JOURNAL_FAIL_CLOSED_CRITICAL';

function makePrisma(txDb: Record<string, unknown>) {
  return {
    journalFailureLog: {
      create: jest.fn().mockResolvedValue({ id: 'f1' }),
      count: jest.fn().mockResolvedValue(0),
    },
    ...txDb,
  };
}

function okAccounts() {
  return {
    findMany: jest.fn().mockResolvedValue([
      { id: 'a-1100', code: '1100' },
      { id: 'a-1300', code: '1300' },
      { id: 'a-2100', code: '2100' },
      { id: 'a-4100', code: '4100' },
    ]),
  };
}

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('dup sourceRef', {
    code: 'P2002',
    clientVersion: 'test',
  } as never);
}

describe('Financial regression — drift cannot recur', () => {
  const original = process.env[FLAG];
  afterEach(() => {
    if (original === undefined) delete process.env[FLAG];
    else process.env[FLAG] = original;
    jest.restoreAllMocks();
  });

  describe('Duplicate payment / deposit / settlement', () => {
    it('a repeated payment with the same ref is idempotent (no second create)', async () => {
      const create = jest.fn();
      const txDb = {
        journalEntry: {
          findUnique: jest.fn().mockResolvedValue({ id: 'existing' }),
          create,
        },
        account: okAccounts(),
      };
      const service = new DoubleEntryJournalService(makePrisma(txDb) as never);

      const result = await service.appendExternalPaymentEntry(txDb as never, {
        customerId,
        orderId,
        actorUserId,
        amount: '5.0000',
        paymentMethod: PosPaymentMethod.CASH,
        paymentRef: `${orderId}:CASH`,
      });

      expect(result).toEqual({ id: 'existing' });
      expect(create).not.toHaveBeenCalled(); // no double post
    });

    it('the integrity guard hard-rejects a double settlement', async () => {
      const prisma = {
        journalEntry: { findUnique: jest.fn().mockResolvedValue({ id: 'paid' }) },
      };
      const guard = new FinancialIntegrityService(prisma as never);
      await expect(
        guard.assertNotAlreadySettled(prisma as never, `JOURNAL:EXTERNAL_PAYMENT:${orderId}:CASH`),
      ).rejects.toMatchObject({ code: 'DOUBLE_SETTLEMENT' });
    });
  });

  describe('Journal imbalance', () => {
    it('appendBalanced rejects an unbalanced entry', async () => {
      const txDb = {
        journalEntry: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        account: okAccounts(),
      };
      const service = new DoubleEntryJournalService(makePrisma(txDb) as never);
      await expect(
        service.appendBalanced(txDb as never, {
          source: 'TEST',
          sourceRef: 'TEST:imbalance',
          actorUserId,
          lines: [
            { accountCode: '1100', debit: '5.0000' },
            { accountCode: '1300', credit: '4.0000' },
          ],
        }),
      ).rejects.toThrow('UNBALANCED_JOURNAL');
    });
  });

  describe('Invalid / double reversal', () => {
    it('a second invoice cancellation is idempotent (no double reversal)', async () => {
      const create = jest.fn();
      const txDb = {
        journalEntry: {
          findUnique: jest.fn().mockResolvedValue({ id: 'reversal-1' }),
          create,
        },
        account: okAccounts(),
      };
      const service = new DoubleEntryJournalService(makePrisma(txDb) as never);
      const result = await service.appendInvoiceCancellationEntry(txDb as never, {
        customerId,
        orderId,
        actorUserId,
        remainingArAmount: '5.0000',
      });
      expect(result).toEqual({ id: 'reversal-1' });
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('Partial failure recovery (HARD FAIL POLICY)', () => {
    it('fail-closed: a wallet-absorption journal failure RE-THROWS so the tx rolls back (no partial success)', async () => {
      process.env[FLAG] = 'true';
      const txDb = {
        journalEntry: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockRejectedValue(new Error('DB_TIMEOUT')),
        },
        account: { findMany: jest.fn().mockResolvedValue([
          { id: 'a-2100', code: '2100' },
          { id: 'a-4100', code: '4100' },
        ]) },
      };
      const prisma = makePrisma(txDb);
      const service = new DoubleEntryJournalService(prisma as never);

      await expect(
        service.appendWalletAbsorptionEntrySafe(txDb as never, {
          customerId,
          orderId,
          actorUserId,
          amount: '5.0000',
        }),
      ).rejects.toThrow('DB_TIMEOUT');
      // forensic row persisted before the throw
      expect(prisma.journalFailureLog.create).toHaveBeenCalledTimes(1);
    });

    it('fail-open (default): the same failure is swallowed but persisted for detection', async () => {
      process.env[FLAG] = 'false';
      const txDb = {
        journalEntry: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockRejectedValue(new Error('DB_TIMEOUT')),
        },
        account: { findMany: jest.fn().mockResolvedValue([
          { id: 'a-2100', code: '2100' },
          { id: 'a-4100', code: '4100' },
        ]) },
      };
      const prisma = makePrisma(txDb);
      const service = new DoubleEntryJournalService(prisma as never);

      const result = await service.appendWalletAbsorptionEntrySafe(txDb as never, {
        customerId,
        orderId,
        actorUserId,
        amount: '5.0000',
      });
      expect(result).toBeNull();
      expect(prisma.journalFailureLog.create).toHaveBeenCalledTimes(1); // detectable
    });
  });

  describe('Queue retry / concurrent requests', () => {
    it('a retried wallet-absorption that races a concurrent writer recovers the existing entry (P2002, no double post)', async () => {
      const txDb = {
        journalEntry: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce(null) // appendBalanced pre-check
            .mockResolvedValue({ id: 'concurrent-winner' }), // P2002 recovery
          create: jest.fn().mockRejectedValue(p2002()),
        },
        account: { findMany: jest.fn().mockResolvedValue([
          { id: 'a-2100', code: '2100' },
          { id: 'a-4100', code: '4100' },
        ]) },
      };
      const prisma = makePrisma(txDb);
      const service = new DoubleEntryJournalService(prisma as never);

      const result = await service.appendWalletAbsorptionEntrySafe(txDb as never, {
        customerId,
        orderId,
        actorUserId,
        amount: '5.0000',
      });
      expect(result).toEqual({ id: 'concurrent-winner' });
      // benign race → NOT recorded as a failure
      expect(prisma.journalFailureLog.create).not.toHaveBeenCalled();
    });
  });
});
