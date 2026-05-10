import { FinancialPeriodStatus } from '@prisma/client';
import { projectPeriodHealth } from './period-lock-monitor';

const FIXED_AT = '2026-05-08T20:00:00.000Z';

describe('V21 Phase 4 — period-lock monitor projection', () => {
  it('returns green when there are no violations and enforcement is on', () => {
    const out = projectPeriodHealth({
      at: FIXED_AT,
      enforcementMode: 'enforcing',
      periods: [
        { status: FinancialPeriodStatus.CLOSED },
        { status: FinancialPeriodStatus.OPEN },
      ],
      violations: [],
    });
    expect(out).toEqual({
      at: FIXED_AT,
      enforcementMode: 'enforcing',
      closedPeriods: 1,
      openPeriods: 1,
      recentViolations: 0,
      recentReversalViolations: 0,
      recentRejectedViolations: 0,
      rejectionsByWriter: [],
      health: 'green',
      reason: 'no rejected period-lock violations in the window',
    });
  });

  it('separates reversal-permitted violations from rejected ones', () => {
    const out = projectPeriodHealth({
      at: FIXED_AT,
      enforcementMode: 'enforcing',
      periods: [],
      violations: [
        {
          writerName: 'JournalService.payment',
          payload: { allowedAsReversal: true },
          attemptedAt: new Date(FIXED_AT),
        },
        {
          writerName: 'JournalService.payment',
          payload: { allowedAsReversal: false },
          attemptedAt: new Date(FIXED_AT),
        },
        {
          writerName: 'OtherWriter',
          payload: null,
          attemptedAt: new Date(FIXED_AT),
        },
      ],
    });
    expect(out.recentReversalViolations).toBe(1);
    expect(out.recentRejectedViolations).toBe(2);
    expect(out.rejectionsByWriter).toEqual([
      { writerName: 'JournalService.payment', count: 1 },
      { writerName: 'OtherWriter', count: 1 },
    ]);
  });

  it('escalates to amber at the configured threshold', () => {
    const violations = Array.from({ length: 5 }, (_, i) => ({
      writerName: 'WriterX',
      payload: { allowedAsReversal: false },
      attemptedAt: new Date(FIXED_AT),
    }));
    const out = projectPeriodHealth({
      at: FIXED_AT,
      enforcementMode: 'enforcing',
      periods: [],
      violations,
    });
    expect(out.health).toBe('amber');
    expect(out.recentRejectedViolations).toBe(5);
  });

  it('escalates to red at the red threshold', () => {
    const violations = Array.from({ length: 25 }, () => ({
      writerName: 'WriterX',
      payload: { allowedAsReversal: false },
      attemptedAt: new Date(FIXED_AT),
    }));
    const out = projectPeriodHealth({
      at: FIXED_AT,
      enforcementMode: 'enforcing',
      periods: [],
      violations,
    });
    expect(out.health).toBe('red');
    expect(out.recentRejectedViolations).toBe(25);
  });

  it('flags amber in monitor mode when any violations occurred', () => {
    const out = projectPeriodHealth({
      at: FIXED_AT,
      enforcementMode: 'monitoring',
      periods: [],
      violations: [
        {
          writerName: 'WriterX',
          payload: { allowedAsReversal: true },
          attemptedAt: new Date(FIXED_AT),
        },
      ],
    });
    expect(out.health).toBe('amber');
    expect(out.reason).toMatch(/monitor mode/);
  });

  it('respects custom thresholds for tenants with different SLOs', () => {
    const out = projectPeriodHealth({
      at: FIXED_AT,
      enforcementMode: 'enforcing',
      periods: [],
      violations: Array.from({ length: 2 }, () => ({
        writerName: 'WriterX',
        payload: null,
        attemptedAt: new Date(FIXED_AT),
      })),
      thresholds: { amber: 1, red: 10 },
    });
    expect(out.health).toBe('amber');
  });
});
