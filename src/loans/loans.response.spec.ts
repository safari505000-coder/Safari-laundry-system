import { Prisma } from '@prisma/client';
import type { LoanRow } from './loans.service';
import { mapLoanResponse, mapLoanResponses } from './loans.response';

function fakeLoan(over: Partial<LoanRow> = {}): LoanRow {
  return {
    id: 'loan-1',
    userId: 'user-1',
    amount: new Prisma.Decimal('300.0000') as unknown as LoanRow['amount'],
    installmentCount: 6,
    monthlyDeduction: new Prisma.Decimal(
      '50.0000',
    ) as unknown as LoanRow['monthlyDeduction'],
    remaining: new Prisma.Decimal(
      '300.0000',
    ) as unknown as LoanRow['remaining'],
    reason: null,
    status: 'PENDING' as LoanRow['status'],
    approvedById: null,
    approvedAt: null,
    rejectedReason: null,
    lastDeductionYearMonth: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    user: {
      id: 'user-1',
      fullName: 'Tester',
      username: 'tester',
      employeeId: null,
      civilId: null,
      jobTitle: null,
      branch: null,
    },
    approvedBy: null,
    ...over,
  } as LoanRow;
}

describe('V21 Phase 5 — loans.response canonical mapper', () => {
  it('computes paidKd as amount - remaining at 4dp', () => {
    const row = fakeLoan({
      amount: new Prisma.Decimal('300.0000') as unknown as LoanRow['amount'],
      remaining: new Prisma.Decimal(
        '125.5000',
      ) as unknown as LoanRow['remaining'],
    });
    expect(mapLoanResponse(row).paidKd).toBe('174.5000');
  });

  it('clamps paidKd at zero when remaining exceeds amount', () => {
    const row = fakeLoan({
      amount: new Prisma.Decimal('100.0000') as unknown as LoanRow['amount'],
      remaining: new Prisma.Decimal(
        '120.0000',
      ) as unknown as LoanRow['remaining'],
    });
    expect(mapLoanResponse(row).paidKd).toBe('0.0000');
  });

  it('returns 0.0000 for an untouched fresh loan', () => {
    const row = fakeLoan();
    expect(mapLoanResponse(row).paidKd).toBe('0.0000');
  });

  it('returns the full amount when remaining is zero (settled)', () => {
    const row = fakeLoan({
      amount: new Prisma.Decimal('99.9990') as unknown as LoanRow['amount'],
      remaining: new Prisma.Decimal('0.0000') as unknown as LoanRow['remaining'],
    });
    expect(mapLoanResponse(row).paidKd).toBe('99.9990');
  });

  it('preserves every original field on the loan row', () => {
    const row = fakeLoan();
    const mapped = mapLoanResponse(row);
    expect(mapped.id).toBe(row.id);
    expect(mapped.userId).toBe(row.userId);
    expect(mapped.installmentCount).toBe(row.installmentCount);
    expect(mapped.user.fullName).toBe('Tester');
  });

  it('mapLoanResponses applies the mapping deterministically across rows', () => {
    const a = fakeLoan({
      id: 'a',
      amount: new Prisma.Decimal('200.0000') as unknown as LoanRow['amount'],
      remaining: new Prisma.Decimal(
        '50.0000',
      ) as unknown as LoanRow['remaining'],
    });
    const b = fakeLoan({
      id: 'b',
      amount: new Prisma.Decimal('120.0000') as unknown as LoanRow['amount'],
      remaining: new Prisma.Decimal(
        '120.0000',
      ) as unknown as LoanRow['remaining'],
    });
    const out = mapLoanResponses([a, b]);
    expect(out[0]?.paidKd).toBe('150.0000');
    expect(out[1]?.paidKd).toBe('0.0000');
  });
});
