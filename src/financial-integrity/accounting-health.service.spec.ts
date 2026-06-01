import { AccountingHealthService } from './accounting-health.service';
import type { ReconciliationReport } from '../finance/reconciliation/reconciliation.service';

function reconReport(overrides: Partial<ReconciliationReport> = {}): ReconciliationReport {
  const rows = overrides.rows ?? [
    { invariant: 'TRIAL_BALANCE', expectedKd: '0', actualKd: '0', deltaKd: '0.0000', ok: true },
    { invariant: 'WALLET_LIABILITY_MATCH', expectedKd: '0', actualKd: '0', deltaKd: '0.0000', ok: true },
  ];
  return {
    generatedAt: new Date().toISOString(),
    durationMs: 1,
    toleranceKd: '0.0010',
    rows,
    driftCount: rows.filter((r) => !r.ok).length,
    ok: rows.every((r) => r.ok),
    ...overrides,
  };
}

function makeService(opts: {
  recon: ReconciliationReport;
  auditValid?: boolean;
  unbalancedEntries?: number;
  duplicates?: number;
  failureBacklog?: number;
}) {
  const reconciliation = { runOnce: jest.fn().mockResolvedValue(opts.recon) };
  const audit = {
    verifyAuditIntegrity: jest
      .fn()
      .mockResolvedValue(
        opts.auditValid === false
          ? { valid: false, checked: 10, brokenAt: 'row-5' }
          : { valid: true, checked: 10 },
      ),
  };
  const prisma = {
    $queryRaw: jest.fn().mockImplementation((strings: TemplateStringsArray) => {
      const sql = strings.join(' ');
      if (sql.includes('HAVING ABS')) {
        return Promise.resolve([{ c: String(opts.unbalancedEntries ?? 0) }]);
      }
      return Promise.resolve([{ c: String(opts.duplicates ?? 0) }]);
    }),
    journalFailureLog: { count: jest.fn().mockResolvedValue(opts.failureBacklog ?? 0) },
  };
  return new AccountingHealthService(prisma as never, reconciliation as never, audit as never);
}

describe('AccountingHealthService', () => {
  it('returns HEALTHY when all checks pass', async () => {
    const service = makeService({ recon: reconReport() });
    const report = await service.computeHealth();
    expect(report.status).toBe('HEALTHY');
    expect(report.criticalCount).toBe(0);
    expect(report.warningCount).toBe(0);
  });

  it('returns CRITICAL when trial balance is off', async () => {
    const service = makeService({
      recon: reconReport({
        rows: [
          { invariant: 'TRIAL_BALANCE', expectedKd: '10', actualKd: '9', deltaKd: '1.0000', ok: false },
        ],
      }),
    });
    const report = await service.computeHealth();
    expect(report.status).toBe('CRITICAL');
  });

  it('returns WARNING for wallet-liability drift only (ledger still internally sound)', async () => {
    const service = makeService({
      recon: reconReport({
        rows: [
          { invariant: 'TRIAL_BALANCE', expectedKd: '0', actualKd: '0', deltaKd: '0.0000', ok: true },
          { invariant: 'WALLET_LIABILITY_MATCH', expectedKd: '100', actualKd: '87', deltaKd: '13.0000', ok: false, detail: 'WALLET_LIABILITY_DRIFT' },
        ],
      }),
    });
    const report = await service.computeHealth();
    expect(report.status).toBe('WARNING');
    const wallet = report.checks.find((c) => c.label === 'WALLET_LIABILITY_MATCH');
    expect(wallet?.status).toBe('WARNING');
    expect(wallet?.metric).toBe('13.0000');
  });

  it('returns CRITICAL when an unbalanced entry exists', async () => {
    const service = makeService({ recon: reconReport(), unbalancedEntries: 2 });
    const report = await service.computeHealth();
    expect(report.status).toBe('CRITICAL');
    expect(report.checks.find((c) => c.key === 'per_entry_balance')?.status).toBe('CRITICAL');
  });

  it('returns CRITICAL when the audit chain is broken', async () => {
    const service = makeService({ recon: reconReport(), auditValid: false });
    const report = await service.computeHealth();
    expect(report.status).toBe('CRITICAL');
  });

  it('returns CRITICAL when journal-failure backlog exceeds threshold', async () => {
    const service = makeService({ recon: reconReport(), failureBacklog: 7 });
    const report = await service.computeHealth();
    expect(report.checks.find((c) => c.key === 'journal_failure_backlog')?.status).toBe('CRITICAL');
    expect(report.status).toBe('CRITICAL');
  });

  it('worstStatus picks the most severe', () => {
    expect(AccountingHealthService.worstStatus(['HEALTHY', 'WARNING', 'HEALTHY'])).toBe('WARNING');
    expect(AccountingHealthService.worstStatus(['WARNING', 'CRITICAL'])).toBe('CRITICAL');
    expect(AccountingHealthService.worstStatus(['HEALTHY'])).toBe('HEALTHY');
  });
});
