/**
 * FINANCIAL HARDENING — chaos suite.
 *
 * Simulates infrastructure failures and asserts the accounting outcome is
 * always either (a) fully committed, or (b) fully rolled back + forensically
 * recorded — never a silent partial drift.
 *
 *   - Database failure (journal write)   → fail-closed re-throws (rollback)
 *   - Network/persist failure (degraded) → swallowed, never propagates
 *   - Queue/Redis failure (alerting)     → never breaks the accounting run
 *   - Retry storm                        → circuit breaker forces a stop
 */
import {
  CRITICAL_FAILURE_THRESHOLD,
  CriticalJournalFailureError,
  DoubleEntryJournalService,
} from '../../general-ledger/double-entry-journal.service';
import { AccountingIntegrityCronService } from '../../financial-integrity/accounting-integrity.cron';
import type { AccountingHealthReport } from '../../financial-integrity/accounting-health.service';

const customerId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '22222222-2222-4222-8222-222222222222';
const orderId = '33333333-3333-4333-8333-333333333333';
const FLAG = 'JOURNAL_FAIL_CLOSED_CRITICAL';

const walletAccounts = {
  findMany: jest.fn().mockResolvedValue([
    { id: 'a-2100', code: '2100' },
    { id: 'a-4100', code: '4100' },
  ]),
};

function failingTxDb(error: unknown) {
  return {
    journalEntry: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockRejectedValue(error),
    },
    account: walletAccounts,
  };
}

function healthyReport(): AccountingHealthReport {
  return {
    status: 'CRITICAL',
    generatedAt: new Date().toISOString(),
    durationMs: 1,
    driftCount: 1,
    criticalCount: 1,
    warningCount: 0,
    checks: [
      { key: 'recon_trial_balance', label: 'TRIAL_BALANCE', status: 'CRITICAL', metric: '1.0000' },
    ],
  };
}

describe('Financial chaos — accounting stays correct under failure', () => {
  const original = process.env[FLAG];
  afterEach(() => {
    if (original === undefined) delete process.env[FLAG];
    else process.env[FLAG] = original;
    jest.restoreAllMocks();
  });

  it('DATABASE failure during a money write rolls back fully (fail-closed) and records forensics', async () => {
    process.env[FLAG] = 'true';
    const txDb = failingTxDb(new Error('ECONNREFUSED database'));
    const prisma = {
      journalFailureLog: {
        create: jest.fn().mockResolvedValue({ id: 'f1' }),
        count: jest.fn().mockResolvedValue(0),
      },
      ...txDb,
    };
    const service = new DoubleEntryJournalService(prisma as never);
    await expect(
      service.appendWalletAbsorptionEntrySafe(txDb as never, {
        customerId, orderId, actorUserId, amount: '5.0000',
      }),
    ).rejects.toThrow('ECONNREFUSED');
    expect(prisma.journalFailureLog.create).toHaveBeenCalledTimes(1);
  });

  it('NETWORK/persist failure (degraded DB) is swallowed and never propagates', async () => {
    process.env[FLAG] = 'false';
    const txDb = failingTxDb(new Error('DB_TIMEOUT'));
    const prisma = {
      journalFailureLog: {
        create: jest.fn().mockRejectedValue(new Error('PERSIST_NETWORK_FAIL')),
        count: jest.fn().mockResolvedValue(0),
      },
      ...txDb,
    };
    const service = new DoubleEntryJournalService(prisma as never);
    const result = await service.appendWalletAbsorptionEntrySafe(txDb as never, {
      customerId, orderId, actorUserId, amount: '5.0000',
    });
    expect(result).toBeNull(); // degraded, but did not crash the business flow
  });

  it('RETRY STORM trips the circuit breaker (forces an operator stop)', async () => {
    process.env[FLAG] = 'false';
    const txDb = failingTxDb(new Error('DB_TIMEOUT'));
    const prisma = {
      journalFailureLog: {
        create: jest.fn().mockResolvedValue({ id: 'f1' }),
        count: jest.fn().mockResolvedValue(CRITICAL_FAILURE_THRESHOLD + 1),
      },
      ...txDb,
    };
    const service = new DoubleEntryJournalService(prisma as never);
    await expect(
      service.mirrorDebtLedgerEntrySafe(txDb as never, {
        source: 'PAYMENT',
        sourceRef: 'PAYMENT:CASH:storm',
        amount: '5.0000',
        actorUserId,
        customerId,
      }),
    ).rejects.toBeInstanceOf(CriticalJournalFailureError);
  });

  it('QUEUE/REDIS failure while alerting never breaks the integrity run', async () => {
    const health = { computeHealth: jest.fn().mockResolvedValue(healthyReport()) };
    const prisma = {
      dailyAccountingIntegrityReport: { create: jest.fn().mockResolvedValue({ id: 'r1' }) },
    };
    const audit = { log: jest.fn() };
    const discord = {
      enqueue: jest.fn().mockImplementation(() => {
        throw new Error('REDIS_DOWN');
      }),
    };
    const cron = new AccountingIntegrityCronService(
      prisma as never,
      health as never,
      audit as never,
      discord as never,
    );
    await expect(cron.runDailyCheck()).resolves.toMatchObject({ status: 'CRITICAL' });
    expect(audit.log).toHaveBeenCalled(); // audit still written
  });
});
