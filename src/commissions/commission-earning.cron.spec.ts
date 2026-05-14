/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for CommissionEarningCron.scanJournalPayments()
 * and the isRunning concurrency guard on scan().
 *
 * scanJournalPayments is a private method; we invoke it directly via
 * (cron as any).scanJournalPayments(since) to keep the test focused
 * without going through the full scan() / cron scheduling machinery.
 */
import { SystemToggleKey } from '@prisma/client';
import { CommissionEarningCron } from './commission-earning.cron';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma() {
  return {
    journalEntry: { findMany: jest.fn() },
    commissionPayout: { findMany: jest.fn().mockResolvedValue([]) },
    order: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

function makeEarning() {
  return {
    earnForJournalPayment: jest.fn().mockResolvedValue(undefined),
    earnForOrder: jest.fn().mockResolvedValue(undefined),
    releaseAfterCollectionForOrder: jest.fn().mockResolvedValue(0),
    releaseEndOfMonth: jest.fn().mockResolvedValue(0),
  };
}

function makeSettings(enabled = true) {
  return { isEnabled: jest.fn().mockResolvedValue(enabled) };
}

function makeCron(
  prisma: ReturnType<typeof makePrisma>,
  earning: ReturnType<typeof makeEarning>,
  settings: ReturnType<typeof makeSettings>,
) {
  return new CommissionEarningCron(prisma as any, earning as any, settings as any);
}

const SINCE = new Date(Date.now() - 30 * 60_000);

// ─── scanJournalPayments ───────────────────────────────────────────────────────

describe('CommissionEarningCron.scanJournalPayments()', () => {
  it('calls earnForJournalPayment for each PAYMENT journal entry', async () => {
    const prisma = makePrisma();
    const earning = makeEarning();
    const cron = makeCron(prisma, earning, makeSettings());

    prisma.journalEntry.findMany.mockResolvedValue([
      { id: 'je-aaa' },
      { id: 'je-bbb' },
      { id: 'je-ccc' },
    ]);

    await (cron as any).scanJournalPayments(SINCE);

    expect(earning.earnForJournalPayment).toHaveBeenCalledTimes(3);
    expect(earning.earnForJournalPayment).toHaveBeenCalledWith('je-aaa');
    expect(earning.earnForJournalPayment).toHaveBeenCalledWith('je-bbb');
    expect(earning.earnForJournalPayment).toHaveBeenCalledWith('je-ccc');
  });

  it('queries JournalEntry with source=PAYMENT and orderId not null (skips wallet entries)', async () => {
    const prisma = makePrisma();
    const cron = makeCron(prisma, makeEarning(), makeSettings());

    prisma.journalEntry.findMany.mockResolvedValue([]);

    await (cron as any).scanJournalPayments(SINCE);

    expect(prisma.journalEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          source: 'PAYMENT',
          orderId: { not: null },
          createdAt: { gte: SINCE },
        }),
      }),
    );
  });

  it('applies take: 500 cap on the query', async () => {
    const prisma = makePrisma();
    const cron = makeCron(prisma, makeEarning(), makeSettings());

    prisma.journalEntry.findMany.mockResolvedValue([]);

    await (cron as any).scanJournalPayments(SINCE);

    expect(prisma.journalEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 }),
    );
  });

  it('handles empty result gracefully — no earnForJournalPayment calls', async () => {
    const prisma = makePrisma();
    const earning = makeEarning();
    const cron = makeCron(prisma, earning, makeSettings());

    prisma.journalEntry.findMany.mockResolvedValue([]);

    await expect((cron as any).scanJournalPayments(SINCE)).resolves.toBeUndefined();
    expect(earning.earnForJournalPayment).not.toHaveBeenCalled();
  });

  it('swallows individual earnForJournalPayment errors and continues', async () => {
    const prisma = makePrisma();
    const earning = makeEarning();
    const cron = makeCron(prisma, earning, makeSettings());

    prisma.journalEntry.findMany.mockResolvedValue([
      { id: 'je-good-1' },
      { id: 'je-bad' },
      { id: 'je-good-2' },
    ]);

    // Second entry throws — should not stop processing the third.
    earning.earnForJournalPayment
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('random error'))
      .mockResolvedValueOnce(undefined);

    await expect((cron as any).scanJournalPayments(SINCE)).resolves.toBeUndefined();
    expect(earning.earnForJournalPayment).toHaveBeenCalledTimes(3);
  });
});

// ─── isRunning guard ──────────────────────────────────────────────────────────

describe('CommissionEarningCron.scan() — isRunning guard', () => {
  let previousNodeEnv: string | undefined;

  beforeAll(() => {
    previousNodeEnv = process.env.NODE_ENV;
    // scan() intentionally no-ops when NODE_ENV=test; these cases assert the mutex.
    process.env.NODE_ENV = 'development';
  });

  afterAll(() => {
    process.env.NODE_ENV = previousNodeEnv;
  });

  it('skips the second tick if the first scan is still executing', async () => {
    const prisma = makePrisma();
    const earning = makeEarning();
    const settings = makeSettings(true);
    const cron = makeCron(prisma, earning, settings);

    // Make isEnabled slow enough that the first scan is still "running"
    // when the second tick fires (return a Promise that resolves after
    // the second scan() call is already queued).
    let resolveFirst!: () => void;
    const firstStarted = new Promise<void>((r) => { resolveFirst = r; });
    settings.isEnabled
      .mockImplementationOnce(
        () => new Promise<boolean>((res) => {
          resolveFirst();
          // Keep the first scan locked until we explicitly release it.
          setTimeout(() => res(false), 50);
        }),
      )
      .mockResolvedValue(false);

    const firstScan = cron.scan();

    // Wait until the first scan has entered doScan() before firing the second.
    await firstStarted;
    const secondScan = cron.scan();

    await Promise.all([firstScan, secondScan]);

    // isEnabled called only once — the second tick returned early.
    expect(settings.isEnabled).toHaveBeenCalledTimes(1);
  });

  it('allows a new scan after the previous one completes', async () => {
    const prisma = makePrisma();
    const earning = makeEarning();
    const settings = makeSettings(false); // disabled → doScan no-ops quickly
    const cron = makeCron(prisma, earning, settings);

    prisma.journalEntry.findMany.mockResolvedValue([]);
    prisma.order.findMany.mockResolvedValue([]);
    prisma.commissionPayout.findMany.mockResolvedValue([]);

    await cron.scan();  // first scan completes
    await cron.scan();  // second scan should proceed (not blocked)

    // Both ticks queried the toggle.
    expect(settings.isEnabled).toHaveBeenCalledTimes(2);
  });
});
