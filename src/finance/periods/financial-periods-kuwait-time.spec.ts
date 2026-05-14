/**
 * INFLATE-1: assertWriteAllowed uses Kuwait local time (UTC+3) for period lookup.
 * A payment timestamped 23:30 Kuwait time on March 31 maps to March (not April).
 * A payment at 00:15 Kuwait time on April 1 maps to April (not March).
 */
import { FinancialPeriodStatus } from '@prisma/client';
import { FinancialPeriodsService } from './financial-periods.service';

function makePrisma(closedPeriods: Array<{ year: number; month: number }>) {
  return {
    financialPeriod: {
      findUnique: jest.fn(({ where }: { where: { year_month: { year: number; month: number } } }) => {
        const { year, month } = where.year_month;
        const closed = closedPeriods.find((p) => p.year === year && p.month === month);
        if (closed) {
          return Promise.resolve({ id: `period-${year}-${month}`, status: FinancialPeriodStatus.CLOSED });
        }
        return Promise.resolve(null);
      }),
    },
    financialPeriodViolation: {
      create: jest.fn().mockResolvedValue({ id: 'v-1' }),
    },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new FinancialPeriodsService(prisma as never);
}

describe('INFLATE-1 — assertWriteAllowed uses Kuwait time (UTC+3)', () => {
  const actor = 'user-1';

  it('payment at 23:30 Kuwait time on March 31 → maps to MARCH (UTC 20:30 on Mar 31)', async () => {
    // Kuwait: Mar 31 23:30 = UTC Mar 31 20:30
    const effectiveAt = new Date('2026-03-31T20:30:00.000Z');
    const prisma = makePrisma([{ year: 2026, month: 3 }]); // March is CLOSED
    const svc = makeService(prisma);

    // Should be rejected (March is closed)
    await expect(
      svc.assertWriteAllowed({
        effectiveAt,
        actorUserId: actor,
        writerName: 'test',
        sourceRef: 'TEST:CLOSED-MARCH',
      }),
    ).rejects.toThrow('CLOSED');
    expect(prisma.financialPeriod.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { year_month: { year: 2026, month: 3 } } }),
    );
  });

  it('payment at 00:15 Kuwait time on April 1 → maps to APRIL (UTC Mar 31 21:15)', async () => {
    // Kuwait: Apr 1 00:15 = UTC Mar 31 21:15
    const effectiveAt = new Date('2026-03-31T21:15:00.000Z');
    const prisma = makePrisma([{ year: 2026, month: 3 }]); // March is CLOSED, April is OPEN
    const svc = makeService(prisma);

    // Should be allowed (April is open)
    const result = await svc.assertWriteAllowed({
      effectiveAt,
      actorUserId: actor,
      writerName: 'test',
      sourceRef: 'TEST:OPEN-APRIL',
    });
    expect(result.allowed).toBe(true);
    // Must have looked up APRIL (month=4), not MARCH
    expect(prisma.financialPeriod.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { year_month: { year: 2026, month: 4 } } }),
    );
  });
});
