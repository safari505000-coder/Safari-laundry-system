/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { FinancialPeriodStatus, Prisma } from '@prisma/client';
import {
  FinancialPeriodsService,
  periodForDate,
} from './financial-periods.service';

function makeStore() {
  const periods = new Map<string, any>(); // key = `${year}-${month}`
  const violations: any[] = [];
  let autoId = 0;

  const tx = {
    financialPeriod: {
      findUnique: jest.fn(({ where }: any) => {
        if (where.year_month) {
          const key = `${where.year_month.year}-${where.year_month.month}`;
          return Promise.resolve(periods.get(key) ?? null);
        }
        if (where.id) {
          for (const v of periods.values()) {
            if (v.id === where.id) return Promise.resolve(v);
          }
        }
        return Promise.resolve(null);
      }),
      findMany: jest.fn(() =>
        Promise.resolve([...periods.values()]),
      ),
      create: jest.fn(({ data }: any) => {
        const key = `${data.year}-${data.month}`;
        if (periods.has(key)) {
          const err: any = new Prisma.PrismaClientKnownRequestError(
            'unique',
            { code: 'P2002', clientVersion: 'test' } as any,
          );
          return Promise.reject(err);
        }
        const id = `p-${++autoId}`;
        const row = {
          id,
          ...data,
          status: data.status ?? FinancialPeriodStatus.OPEN,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        periods.set(key, row);
        return Promise.resolve(row);
      }),
      update: jest.fn(({ where, data }: any) => {
        for (const v of periods.values()) {
          if (v.id === where.id) {
            Object.assign(v, data);
            return Promise.resolve(v);
          }
        }
        return Promise.reject(new Error('not found'));
      }),
    },
    financialPeriodViolation: {
      create: jest.fn(({ data }: any) => {
        violations.push(data);
        return Promise.resolve({ id: `v-${violations.length}`, ...data });
      }),
      findMany: jest.fn(({ where, take }: any = {}) => {
        const rows = violations.filter((v) =>
          where?.periodId ? v.periodId === where.periodId : true,
        );
        return Promise.resolve(take ? rows.slice(0, take) : rows);
      }),
    },
  };
  const prisma: any = {
    ...tx,
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  return { prisma, periods, violations, tx };
}

describe('V20.5 — Phase 5 FinancialPeriodsService', () => {
  it('periodForDate returns 1-indexed month + UTC year', () => {
    const d = new Date('2026-01-31T22:00:00.000Z');
    expect(periodForDate(d)).toEqual({ year: 2026, month: 1 });
  });

  it('rejects out-of-range year / month', async () => {
    const { prisma } = makeStore();
    const svc = new FinancialPeriodsService(prisma);
    await expect(svc.getStatus(1999, 1)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.getStatus(2026, 0)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.getStatus(2026, 13)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('getStatus returns implicit OPEN for periods with no row', async () => {
    const { prisma } = makeStore();
    const svc = new FinancialPeriodsService(prisma);
    const s = await svc.getStatus(2026, 1);
    expect(s.status).toBe(FinancialPeriodStatus.OPEN);
    expect(s.lockedAt).toBeNull();
  });

  it('closePeriod requires the matching confirmation token', async () => {
    const { prisma } = makeStore();
    const svc = new FinancialPeriodsService(prisma);
    await expect(
      svc.closePeriod({
        year: 2026,
        month: 1,
        actorId: 'u-1',
        confirmation: 'wrong',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const r = await svc.closePeriod({
      year: 2026,
      month: 1,
      actorId: 'u-1',
      confirmation: 'CLOSE-2026-01',
      notes: 'month-end',
    });
    expect(r.status).toBe(FinancialPeriodStatus.CLOSED);
  });

  it('closing a CLOSED period is a no-op', async () => {
    const { prisma } = makeStore();
    const svc = new FinancialPeriodsService(prisma);
    const a = await svc.closePeriod({
      year: 2026,
      month: 1,
      actorId: 'u-1',
      confirmation: 'CLOSE-2026-01',
    });
    const b = await svc.closePeriod({
      year: 2026,
      month: 1,
      actorId: 'u-2',
      confirmation: 'CLOSE-2026-01',
    });
    expect(b.id).toBe(a.id);
    expect(b.lockedById).toBe('u-1'); // no overwrite
  });

  it('reopenPeriod requires reason + confirmation token', async () => {
    const { prisma } = makeStore();
    const svc = new FinancialPeriodsService(prisma);
    await svc.closePeriod({
      year: 2026,
      month: 1,
      actorId: 'u-1',
      confirmation: 'CLOSE-2026-01',
    });

    await expect(
      svc.reopenPeriod({
        year: 2026,
        month: 1,
        actorId: 'u-2',
        reason: '',
        confirmation: 'REOPEN-2026-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      svc.reopenPeriod({
        year: 2026,
        month: 1,
        actorId: 'u-2',
        reason: 'late invoice',
        confirmation: 'wrong',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const r = await svc.reopenPeriod({
      year: 2026,
      month: 1,
      actorId: 'u-2',
      reason: 'late invoice',
      confirmation: 'REOPEN-2026-01',
    });
    expect(r.status).toBe(FinancialPeriodStatus.OPEN);
  });

  it('reopening an implicit OPEN throws BadRequest', async () => {
    const { prisma } = makeStore();
    const svc = new FinancialPeriodsService(prisma);
    await expect(
      svc.reopenPeriod({
        year: 2026,
        month: 1,
        actorId: 'u-1',
        reason: 'x',
        confirmation: 'REOPEN-2026-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('assertWriteAllowed allows writes in OPEN periods (no row)', async () => {
    const { prisma } = makeStore();
    const svc = new FinancialPeriodsService(prisma);
    const out = await svc.assertWriteAllowed({
      effectiveAt: new Date('2026-01-15T00:00:00.000Z'),
      actorUserId: 'u-1',
      writerName: 'WriterA',
      sourceRef: 'sr-1',
    });
    expect(out.allowed).toBe(true);
    expect(out.periodId).toBeNull();
  });

  it('assertWriteAllowed rejects writes in CLOSED periods + logs violation', async () => {
    const { prisma, violations } = makeStore();
    const svc = new FinancialPeriodsService(prisma);
    await svc.closePeriod({
      year: 2026,
      month: 1,
      actorId: 'u-1',
      confirmation: 'CLOSE-2026-01',
    });
    await expect(
      svc.assertWriteAllowed({
        effectiveAt: new Date('2026-01-15T00:00:00.000Z'),
        actorUserId: 'u-9',
        writerName: 'WriterX',
        sourceRef: 'sr-2',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(violations).toHaveLength(1);
    expect(violations[0].writerName).toBe('WriterX');
  });

  it('assertWriteAllowed permits reversal entries even on CLOSED + logs them', async () => {
    const { prisma, violations } = makeStore();
    const svc = new FinancialPeriodsService(prisma);
    await svc.closePeriod({
      year: 2026,
      month: 1,
      actorId: 'u-1',
      confirmation: 'CLOSE-2026-01',
    });
    const out = await svc.assertWriteAllowed({
      effectiveAt: new Date('2026-01-15T00:00:00.000Z'),
      actorUserId: 'u-9',
      writerName: 'WriterReversal',
      sourceRef: 'sr-3',
      allowReversal: true,
    });
    expect(out.allowed).toBe(true);
    expect(violations).toHaveLength(1);
    expect(violations[0].payload.allowedAsReversal).toBe(true);
  });
});
