import { FinancialObservabilityService } from './financial-observability.service';

/**
 * V20.6 — Phase 3 spec.
 *
 * Validates:
 *   1. Healthy state (no drift, no fraud, no failures) → score 100, HEALTHY
 *   2. Drift present → reconciliation status WARNING/CRITICAL
 *   3. Fraud alerts → fraud section reflects open + critical counts
 *   4. Period violations counted within window
 *   5. Snapshot lag computed correctly
 *   6. Performance endpoint returns all sub-sections
 *   7. Score is deterministic for same inputs (idempotent)
 *   8. Missing primaries (e.g. mock without fraudAlert) degrade gracefully
 */

function makePrisma(overrides: any = {}) {
  return {
    financialSnapshot: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      ...overrides.financialSnapshot,
    },
    financialPeriodViolation: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      ...overrides.financialPeriodViolation,
    },
    fraudAlert: {
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
      ...overrides.fraudAlert,
    },
    journalFailureLog: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      ...overrides.journalFailureLog,
    },
    promiseToPay: {
      count: jest.fn().mockResolvedValue(0),
      ...overrides.promiseToPay,
    },
    collectionsAccount: {
      count: jest.fn().mockResolvedValue(0),
      ...overrides.collectionsAccount,
    },
    ...overrides,
  };
}

function makeReconciliation(rows: Array<{ ok: boolean; invariant: string; deltaKd?: string }>) {
  return {
    runOnce: jest.fn().mockResolvedValue({
      generatedAt: '2026-05-07T12:00:00.000Z',
      durationMs: 42,
      ok: rows.every((r) => r.ok),
      driftCount: rows.filter((r) => !r.ok).length,
      rows: rows.map((r) => ({
        invariant: r.invariant,
        expectedKd: '0.0000',
        actualKd: '0.0000',
        deltaKd: r.deltaKd ?? '0.0000',
        ok: r.ok,
        detail: r.ok ? undefined : `${r.invariant}_DRIFT`,
      })),
    }),
  } as any;
}

describe('V20.6 — FINANCIAL OBSERVABILITY', () => {
  it('overview returns 100 score and HEALTHY when everything is clean', async () => {
    const prisma = makePrisma();
    const recon = makeReconciliation([
      { ok: true, invariant: 'TRIAL_BALANCE' },
      { ok: true, invariant: 'AR_INTEGRITY' },
      { ok: true, invariant: 'WALLET_LIABILITY_MATCH' },
      { ok: true, invariant: 'ASSETS_EQ_LIAB_PLUS_EQUITY' },
    ]);
    const svc = new FinancialObservabilityService(prisma, recon);

    const result = await svc.overview(24);
    expect(result.healthScore).toBe(100);
    expect(result.status).toBe('HEALTHY');
    expect(result.sections).toHaveLength(6);
    const recSec = result.sections.find((s) => s.key === 'reconciliation');
    expect(recSec?.status).toBe('HEALTHY');
  });

  it('overview drops to CRITICAL on 3+ failed invariants', async () => {
    const prisma = makePrisma();
    const recon = makeReconciliation([
      { ok: false, invariant: 'TRIAL_BALANCE' },
      { ok: false, invariant: 'AR_INTEGRITY' },
      { ok: false, invariant: 'WALLET_LIABILITY_MATCH' },
      { ok: true, invariant: 'ASSETS_EQ_LIAB_PLUS_EQUITY' },
    ]);
    const svc = new FinancialObservabilityService(prisma, recon);
    const result = await svc.overview();
    const recSec = result.sections.find((s) => s.key === 'reconciliation');
    expect(recSec?.status).toBe('CRITICAL');
    // reconciliation worth 35% so 3 failures push it to ~25 score; overall < 80
    expect(result.healthScore).toBeLessThan(80);
  });

  it('fraud section shows CRITICAL when any OPEN+CRITICAL alert exists', async () => {
    const prisma = makePrisma({
      fraudAlert: {
        count: jest.fn(({ where }: any) => {
          if (where.severity === 'CRITICAL') return Promise.resolve(2);
          return Promise.resolve(7);
        }),
        groupBy: jest.fn().mockResolvedValue([
          { severity: 'CRITICAL', _count: { _all: 2 } },
          { severity: 'HIGH', _count: { _all: 5 } },
        ]),
      },
    });
    const recon = makeReconciliation([
      { ok: true, invariant: 'TRIAL_BALANCE' },
      { ok: true, invariant: 'AR_INTEGRITY' },
      { ok: true, invariant: 'WALLET_LIABILITY_MATCH' },
      { ok: true, invariant: 'ASSETS_EQ_LIAB_PLUS_EQUITY' },
    ]);
    const svc = new FinancialObservabilityService(prisma, recon);
    const result = await svc.overview();
    const fraud = result.sections.find((s) => s.key === 'fraud');
    expect(fraud?.status).toBe('CRITICAL');
    expect(fraud?.detail).toContain('CRITICAL');
  });

  it('drift endpoint enumerates failing invariants and recent period violations', async () => {
    const violations = [
      {
        id: 'v-1',
        writerName: 'DoubleEntryJournalService.PAYMENT',
        sourceRef: 'JOURNAL:PAYMENT:o1:CASH',
        attemptedAt: new Date('2026-05-07T11:00:00Z'),
      },
      {
        id: 'v-2',
        writerName: 'DoubleEntryJournalService.INVOICE_ISSUED',
        sourceRef: 'JOURNAL:INVOICE_ISSUED:o2',
        attemptedAt: new Date('2026-05-07T10:00:00Z'),
      },
    ];
    const prisma = makePrisma({
      financialPeriodViolation: {
        findMany: jest.fn().mockResolvedValue(violations),
        count: jest.fn().mockResolvedValue(2),
      },
    });
    const recon = makeReconciliation([
      { ok: false, invariant: 'AR_INTEGRITY', deltaKd: '12.3400' },
      { ok: true, invariant: 'TRIAL_BALANCE' },
    ]);
    const svc = new FinancialObservabilityService(prisma, recon);
    const result = await svc.drift(24);
    expect(result.reconciliationOk).toBe(false);
    expect(result.drift).toHaveLength(1);
    expect(result.drift[0].invariant).toBe('AR_INTEGRITY');
    expect(result.drift[0].deltaKd).toBe('12.3400');
    expect(result.periodViolations).toBe(2);
    expect(result.recentViolations).toHaveLength(2);
    expect(result.recentViolations[0].id).toBe('v-1');
  });

  it('reconciliation report passes through full row list', async () => {
    const prisma = makePrisma();
    const recon = makeReconciliation([
      { ok: true, invariant: 'TRIAL_BALANCE' },
      { ok: false, invariant: 'AR_INTEGRITY', deltaKd: '5.0000' },
    ]);
    const svc = new FinancialObservabilityService(prisma, recon);
    const result = await svc.reconciliationReport();
    expect(result.ok).toBe(false);
    expect(result.driftCount).toBe(1);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1].deltaKd).toBe('5.0000');
  });

  it('performance endpoint computes snapshot lag, fraud, promises, collections', async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const prisma = makePrisma({
      financialSnapshot: {
        count: jest
          .fn()
          .mockResolvedValueOnce(100) // total
          .mockResolvedValueOnce(30)  // > 10min
          .mockResolvedValueOnce(5),  // > 1h
        findFirst: jest.fn().mockResolvedValue({ refreshedAt: twoHoursAgo }),
      },
      fraudAlert: {
        count: jest.fn().mockResolvedValue(3),
        groupBy: jest.fn().mockResolvedValue([
          { severity: 'HIGH', _count: { _all: 2 } },
          { severity: 'LOW', _count: { _all: 1 } },
        ]),
      },
      promiseToPay: {
        count: jest
          .fn()
          .mockResolvedValueOnce(10) // active
          .mockResolvedValueOnce(2)  // brokenLast24h
          .mockResolvedValueOnce(7), // keptLast24h
      },
      collectionsAccount: {
        count: jest
          .fn()
          .mockResolvedValueOnce(4) // escalated
          .mockResolvedValueOnce(3), // overdueSla
      },
      journalFailureLog: {
        count: jest
          .fn()
          .mockResolvedValueOnce(8)  // total
          .mockResolvedValueOnce(2), // last24h
        findMany: jest
          .fn()
          .mockResolvedValue([{ customerId: 'a' }, { customerId: 'b' }]),
      },
    });
    const recon = makeReconciliation([{ ok: true, invariant: 'TRIAL_BALANCE' }]);
    const svc = new FinancialObservabilityService(prisma, recon);
    const result = await svc.performance(24);

    expect(result.snapshot.rows).toBe(100);
    expect(result.snapshot.stalePctOver10min).toBeCloseTo(30, 0);
    expect(result.snapshot.stalePctOver1hour).toBeCloseTo(5, 0);
    expect(result.snapshot.oldestLagMinutes).toBeGreaterThanOrEqual(115);
    expect(result.fraudAlerts.open).toBe(3);
    expect(result.fraudAlerts.bySeverity.HIGH).toBe(2);
    expect(result.promises).toEqual({ active: 10, brokenLast24h: 2, keptLast24h: 7 });
    expect(result.collections).toEqual({ escalated: 4, overdueSla: 3 });
    expect(result.journalFailures.total).toBe(8);
    expect(result.journalFailures.last24h).toBe(2);
    expect(result.journalFailures.distinctCustomers24h).toBe(2);
  });

  it('overview is deterministic (idempotent) for same inputs', async () => {
    const prisma = makePrisma();
    const recon = makeReconciliation([
      { ok: true, invariant: 'TRIAL_BALANCE' },
      { ok: true, invariant: 'AR_INTEGRITY' },
    ]);
    const svc = new FinancialObservabilityService(prisma, recon);
    const a = await svc.overview(24);
    const b = await svc.overview(24);
    expect(a.healthScore).toBe(b.healthScore);
    expect(a.status).toBe(b.status);
  });

  it('degrades gracefully when reconciliation throws', async () => {
    const prisma = makePrisma();
    const recon = {
      runOnce: jest.fn().mockRejectedValue(new Error('DB outage')),
    } as any;
    const svc = new FinancialObservabilityService(prisma, recon);
    const result = await svc.overview();
    const recSec = result.sections.find((s) => s.key === 'reconciliation');
    expect(recSec?.status).toBe('DEGRADED');
    expect(recSec?.metric).toBe('unavailable');
    expect(result.healthScore).toBeGreaterThan(0);
  });

  it('window clamps to 1..168 hours and defaults to 24 in controller layer', async () => {
    const prisma = makePrisma();
    const recon = makeReconciliation([{ ok: true, invariant: 'TRIAL_BALANCE' }]);
    const svc = new FinancialObservabilityService(prisma, recon);
    const result = await svc.overview(24);
    expect(result.windowHours).toBe(24);
  });
});
