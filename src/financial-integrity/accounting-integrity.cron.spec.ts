import { AccountingIntegrityCronService } from './accounting-integrity.cron';
import type { AccountingHealthReport } from './accounting-health.service';

function report(status: 'HEALTHY' | 'WARNING' | 'CRITICAL'): AccountingHealthReport {
  return {
    status,
    generatedAt: new Date().toISOString(),
    durationMs: 5,
    driftCount: status === 'HEALTHY' ? 0 : 1,
    criticalCount: status === 'CRITICAL' ? 1 : 0,
    warningCount: status === 'WARNING' ? 1 : 0,
    checks: [
      {
        key: 'recon_wallet_liability_match',
        label: 'WALLET_LIABILITY_MATCH',
        status,
        metric: status === 'HEALTHY' ? '0.0000' : '13.0000',
        detail: status === 'HEALTHY' ? undefined : 'WALLET_LIABILITY_DRIFT',
      },
    ],
  };
}

function makeService(healthReport: AccountingHealthReport) {
  const health = { computeHealth: jest.fn().mockResolvedValue(healthReport) };
  const create = jest.fn().mockResolvedValue({ id: 'r1' });
  const prisma = { dailyAccountingIntegrityReport: { create } } as never;
  const audit = { log: jest.fn() };
  const discord = { enqueue: jest.fn() };
  const service = new AccountingIntegrityCronService(
    prisma,
    health as never,
    audit as never,
    discord as never,
  );
  return { service, create, audit, discord, health };
}

describe('AccountingIntegrityCronService', () => {
  it('persists a report and writes an audit log on a HEALTHY run (no alert)', async () => {
    const { service, create, audit, discord } = makeService(report('HEALTHY'));
    const result = await service.runDailyCheck();
    expect(result.status).toBe('HEALTHY');
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).toMatchObject({ status: 'HEALTHY' });
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log.mock.calls[0][0]).toMatchObject({
      action: 'ACCOUNTING_INTEGRITY_CHECK',
      suspicious: false,
    });
    expect(discord.enqueue).not.toHaveBeenCalled();
  });

  it('raises a CRITICAL alert + suspicious audit on a CRITICAL run', async () => {
    const { service, audit, discord } = makeService(report('CRITICAL'));
    await service.runDailyCheck();
    expect(audit.log.mock.calls[0][0]).toMatchObject({ suspicious: true });
    expect(discord.enqueue).toHaveBeenCalledTimes(1);
    // invariant_* events are classified CRITICAL by the Discord queue.
    expect(discord.enqueue.mock.calls[0][0]).toBe('invariant_accounting_integrity');
  });

  it('raises a non-critical event on a WARNING run', async () => {
    const { service, discord } = makeService(report('WARNING'));
    await service.runDailyCheck();
    expect(discord.enqueue.mock.calls[0][0]).toBe('accounting_integrity_warning');
  });

  it('drift listener alerts + audits immediately', () => {
    const { service, audit, discord } = makeService(report('HEALTHY'));
    service.onDriftDetected({
      invariant: 'WALLET_LIABILITY_MATCH',
      expectedKd: '100.0000',
      actualKd: '87.0000',
      deltaKd: '13.0000',
      generatedAt: new Date().toISOString(),
    });
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log.mock.calls[0][0]).toMatchObject({
      action: 'ACCOUNTING_DRIFT_DETECTED',
      suspicious: true,
    });
    expect(discord.enqueue.mock.calls[0][0]).toBe('invariant_wallet_liability_match');
  });

  it('a persist failure never throws (degraded DB must not break the run)', async () => {
    const { service, create } = makeService(report('HEALTHY'));
    create.mockRejectedValueOnce(new Error('DB_DOWN'));
    await expect(service.runDailyCheck()).resolves.toMatchObject({ status: 'HEALTHY' });
  });
});
