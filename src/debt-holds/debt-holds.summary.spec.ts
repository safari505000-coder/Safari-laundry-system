import { Prisma } from '@prisma/client';
import {
  summariseDebtHolds,
  type DebtHoldRowForSummary,
} from './debt-holds.summary';

function row(over: Partial<DebtHoldRowForSummary>): DebtHoldRowForSummary {
  return {
    id: 'h-1',
    employeeUserId: 'u-1',
    status: 'HELD',
    holdAmount: new Prisma.Decimal('0'),
    releasedAmount: new Prisma.Decimal('0'),
    disbursedAt: null,
    employee: { id: 'u-1', fullName: 'A', username: 'a' },
    ...over,
  };
}

describe('V21 Phase 5 — summariseDebtHolds canonical aggregator', () => {
  it('returns zero totals for an empty list', () => {
    const out = summariseDebtHolds([]);
    expect(out.totals).toEqual({
      heldKd: '0.0000',
      pendingKd: '0.0000',
      disbursedKd: '0.0000',
    });
    expect(out.perEmployee).toEqual([]);
    expect(out.rows).toEqual([]);
  });

  it('sums HELD rows into the heldKd total', () => {
    const out = summariseDebtHolds([
      row({
        id: 'h-1',
        status: 'HELD',
        holdAmount: new Prisma.Decimal('12.5000'),
      }),
      row({
        id: 'h-2',
        status: 'HELD',
        holdAmount: new Prisma.Decimal('7.5000'),
      }),
    ]);
    expect(out.totals.heldKd).toBe('20.0000');
  });

  it('separates RELEASED+disbursed from RELEASED+pending', () => {
    const out = summariseDebtHolds([
      row({
        id: 'r-1',
        status: 'RELEASED',
        releasedAmount: new Prisma.Decimal('10.0000'),
        disbursedAt: new Date(),
      }),
      row({
        id: 'r-2',
        status: 'RELEASED',
        releasedAmount: new Prisma.Decimal('3.0000'),
        disbursedAt: null,
      }),
    ]);
    expect(out.totals.disbursedKd).toBe('10.0000');
    expect(out.totals.pendingKd).toBe('3.0000');
    expect(out.totals.heldKd).toBe('0.0000');
  });

  it('groups per employee with held/pending/disbursed buckets', () => {
    const out = summariseDebtHolds([
      row({
        id: 'a-1',
        employeeUserId: 'A',
        employee: { id: 'A', fullName: 'Alice', username: 'a' },
        status: 'HELD',
        holdAmount: new Prisma.Decimal('5.0000'),
      }),
      row({
        id: 'a-2',
        employeeUserId: 'A',
        employee: { id: 'A', fullName: 'Alice', username: 'a' },
        status: 'RELEASED',
        releasedAmount: new Prisma.Decimal('2.0000'),
        disbursedAt: null,
      }),
      row({
        id: 'b-1',
        employeeUserId: 'B',
        employee: { id: 'B', fullName: 'Bob', username: 'b' },
        status: 'HELD',
        holdAmount: new Prisma.Decimal('9.5000'),
      }),
    ]);
    expect(out.perEmployee[0]?.fullName).toBe('Bob');
    expect(out.perEmployee[0]?.heldKd).toBe('9.5000');
    expect(out.perEmployee[1]?.fullName).toBe('Alice');
    expect(out.perEmployee[1]?.heldKd).toBe('5.0000');
    expect(out.perEmployee[1]?.pendingKd).toBe('2.0000');
    expect(out.perEmployee[1]?.heldIds).toEqual(['a-1']);
    expect(out.perEmployee[1]?.pendingIds).toEqual(['a-2']);
  });

  it('sorts perEmployee by held DESC', () => {
    const out = summariseDebtHolds([
      row({
        id: '1',
        employeeUserId: 'X',
        employee: { id: 'X', fullName: 'X', username: 'x' },
        status: 'HELD',
        holdAmount: new Prisma.Decimal('1'),
      }),
      row({
        id: '2',
        employeeUserId: 'Y',
        employee: { id: 'Y', fullName: 'Y', username: 'y' },
        status: 'HELD',
        holdAmount: new Prisma.Decimal('100'),
      }),
      row({
        id: '3',
        employeeUserId: 'Z',
        employee: { id: 'Z', fullName: 'Z', username: 'z' },
        status: 'HELD',
        holdAmount: new Prisma.Decimal('50'),
      }),
    ]);
    expect(out.perEmployee.map((e) => e.fullName)).toEqual(['Y', 'Z', 'X']);
  });

  it('preserves the row order on the wrapped rows field', () => {
    const inputs = [
      row({ id: '1', status: 'HELD', holdAmount: new Prisma.Decimal('1') }),
      row({ id: '2', status: 'HELD', holdAmount: new Prisma.Decimal('2') }),
      row({ id: '3', status: 'HELD', holdAmount: new Prisma.Decimal('3') }),
    ];
    const out = summariseDebtHolds(inputs);
    expect(out.rows.map((r) => r.id)).toEqual(['1', '2', '3']);
  });

  it('accepts string-typed Decimals from JSON-cast rows', () => {
    const out = summariseDebtHolds([
      row({
        id: '1',
        status: 'HELD',
        holdAmount: '4.2500',
      }),
    ]);
    expect(out.totals.heldKd).toBe('4.2500');
  });
});
