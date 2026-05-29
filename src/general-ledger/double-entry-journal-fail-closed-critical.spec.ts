/**
 * Fail-closed journaling for CRITICAL wrappers.
 *
 * Verifies the JOURNAL_FAIL_CLOSED_CRITICAL flag for the two
 * critical wrappers only:
 *   - appendExternalPaymentEntrySafe (cash / KNET / payment-link)
 *   - appendInvoiceIssuanceEntrySafe (invoice issuance)
 *
 * Contract under test:
 *   - flag ON  + write fails        -> re-throws (transaction aborts)
 *   - flag OFF + write fails        -> swallows + returns null (legacy)
 *   - P2002 idempotency recovery still returns the existing entry
 *   - period-lock conflicts still re-throw regardless of the flag
 *   - the failure is always persisted to JournalFailureLog + logged
 */
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PosPaymentMethod } from '@prisma/client';
import { DoubleEntryJournalService } from './double-entry-journal.service';

const customerId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '22222222-2222-4222-8222-222222222222';
const orderId = '33333333-3333-4333-8333-333333333333';

const FLAG = 'JOURNAL_FAIL_CLOSED_CRITICAL';

function makePrisma(txDb: Record<string, unknown>, failureCount = 0) {
  return {
    journalFailureLog: {
      create: jest.fn().mockResolvedValue({ id: 'failure-1' }),
      count: jest.fn().mockResolvedValue(failureCount),
    },
    ...txDb,
  };
}

/** Tx db whose journal create rejects with a generic write error. */
function makeFailingTxDb(error: unknown = new Error('DB_TIMEOUT')) {
  return {
    journalEntry: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockRejectedValue(error),
    },
    account: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'account-1100', code: '1100' },
        { id: 'account-1300', code: '1300' },
        { id: 'account-4100', code: '4100' },
      ]),
    },
  };
}

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`sourceRef`)',
    { code: 'P2002', clientVersion: 'test' } as never,
  );
}

const externalPaymentInput = {
  customerId,
  orderId,
  actorUserId,
  amount: '5.0000',
  paymentMethod: PosPaymentMethod.CASH,
  paymentRef: `${orderId}:CASH`,
};

const invoiceIssuanceInput = {
  customerId,
  orderId,
  actorUserId,
  amount: '5.0000',
};

describe('Fail-closed CRITICAL journaling — JOURNAL_FAIL_CLOSED_CRITICAL', () => {
  const original = process.env[FLAG];

  afterEach(() => {
    if (original === undefined) delete process.env[FLAG];
    else process.env[FLAG] = original;
    jest.restoreAllMocks();
  });

  describe('appendExternalPaymentEntrySafe', () => {
    it('flag ON + write fails -> re-throws (transaction aborts), persists, no breaker', async () => {
      process.env[FLAG] = 'true';
      const txDb = makeFailingTxDb();
      const prisma = makePrisma(txDb);
      const service = new DoubleEntryJournalService(prisma as never);

      await expect(
        service.appendExternalPaymentEntrySafe(txDb as never, externalPaymentInput),
      ).rejects.toThrow('DB_TIMEOUT');

      // Persisted BEFORE throwing.
      expect(prisma.journalFailureLog.create).toHaveBeenCalledTimes(1);
      expect(prisma.journalFailureLog.create.mock.calls[0][0].data).toMatchObject({
        customerId,
        sourceRef: `JOURNAL:EXTERNAL_PAYMENT:${orderId}:CASH`,
      });
      // Breaker skipped on the fail-closed path.
      expect(prisma.journalFailureLog.count).not.toHaveBeenCalled();
    });

    it('flag OFF + write fails -> swallows + returns null (legacy), trips breaker', async () => {
      process.env[FLAG] = 'false';
      const txDb = makeFailingTxDb();
      const prisma = makePrisma(txDb);
      const service = new DoubleEntryJournalService(prisma as never);

      const result = await service.appendExternalPaymentEntrySafe(
        txDb as never,
        externalPaymentInput,
      );

      expect(result).toBeNull();
      expect(prisma.journalFailureLog.create).toHaveBeenCalledTimes(1);
      expect(prisma.journalFailureLog.count).toHaveBeenCalledTimes(1);
    });

    it('flag UNSET behaves like OFF (default fail-open)', async () => {
      delete process.env[FLAG];
      const txDb = makeFailingTxDb();
      const prisma = makePrisma(txDb);
      const service = new DoubleEntryJournalService(prisma as never);

      const result = await service.appendExternalPaymentEntrySafe(
        txDb as never,
        externalPaymentInput,
      );

      expect(result).toBeNull();
    });

    it('flag ON + P2002 with existing entry -> idempotent success (no throw)', async () => {
      process.env[FLAG] = 'true';
      const txDb = makeFailingTxDb(p2002());
      // 1st findUnique (appendBalanced) -> null; 2nd (recovery) -> existing.
      txDb.journalEntry.findUnique = jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ id: 'existing-journal' });
      const prisma = makePrisma(txDb);
      const service = new DoubleEntryJournalService(prisma as never);

      const result = await service.appendExternalPaymentEntrySafe(
        txDb as never,
        externalPaymentInput,
      );

      expect(result).toEqual({ id: 'existing-journal' });
      // No failure recorded — this was a benign concurrency race.
      expect(prisma.journalFailureLog.create).not.toHaveBeenCalled();
    });

    it('period-lock conflict re-throws even when flag OFF', async () => {
      process.env[FLAG] = 'false';
      const txDb = makeFailingTxDb(
        new ConflictException('Accounting period is CLOSED'),
      );
      const prisma = makePrisma(txDb);
      const service = new DoubleEntryJournalService(prisma as never);

      await expect(
        service.appendExternalPaymentEntrySafe(txDb as never, externalPaymentInput),
      ).rejects.toBeInstanceOf(ConflictException);
      // Period-lock aborts immediately — not logged as a journal write failure.
      expect(prisma.journalFailureLog.create).not.toHaveBeenCalled();
    });
  });

  describe('appendInvoiceIssuanceEntrySafe', () => {
    it('flag ON + write fails -> re-throws (transaction aborts), persists', async () => {
      process.env[FLAG] = 'true';
      const txDb = makeFailingTxDb();
      const prisma = makePrisma(txDb);
      const service = new DoubleEntryJournalService(prisma as never);

      await expect(
        service.appendInvoiceIssuanceEntrySafe(txDb as never, invoiceIssuanceInput),
      ).rejects.toThrow('DB_TIMEOUT');

      expect(prisma.journalFailureLog.create).toHaveBeenCalledTimes(1);
      expect(prisma.journalFailureLog.create.mock.calls[0][0].data).toMatchObject({
        customerId,
        sourceRef: `JOURNAL:INVOICE_ISSUED:${orderId}`,
      });
      expect(prisma.journalFailureLog.count).not.toHaveBeenCalled();
    });

    it('flag OFF + write fails -> swallows + returns null (legacy)', async () => {
      process.env[FLAG] = 'false';
      const txDb = makeFailingTxDb();
      const prisma = makePrisma(txDb);
      const service = new DoubleEntryJournalService(prisma as never);

      const result = await service.appendInvoiceIssuanceEntrySafe(
        txDb as never,
        invoiceIssuanceInput,
      );

      expect(result).toBeNull();
      expect(prisma.journalFailureLog.create).toHaveBeenCalledTimes(1);
      expect(prisma.journalFailureLog.count).toHaveBeenCalledTimes(1);
    });

    it('flag ON + P2002 with existing entry -> idempotent success (no throw)', async () => {
      process.env[FLAG] = 'true';
      const txDb = makeFailingTxDb(p2002());
      txDb.journalEntry.findUnique = jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ id: 'existing-invoice-journal' });
      const prisma = makePrisma(txDb);
      const service = new DoubleEntryJournalService(prisma as never);

      const result = await service.appendInvoiceIssuanceEntrySafe(
        txDb as never,
        invoiceIssuanceInput,
      );

      expect(result).toEqual({ id: 'existing-invoice-journal' });
      expect(prisma.journalFailureLog.create).not.toHaveBeenCalled();
    });

    it('period-lock conflict re-throws even when flag OFF', async () => {
      process.env[FLAG] = 'false';
      const txDb = makeFailingTxDb(
        new ConflictException('period is CLOSED for this date'),
      );
      const prisma = makePrisma(txDb);
      const service = new DoubleEntryJournalService(prisma as never);

      await expect(
        service.appendInvoiceIssuanceEntrySafe(txDb as never, invoiceIssuanceInput),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.journalFailureLog.create).not.toHaveBeenCalled();
    });
  });
});
