import { Prisma } from '@prisma/client';
import {
  computeAdHocNetSalary,
  computePayrollNetSalary,
  mapPayrollAdHocLine,
  mapPayrollRow,
} from './payroll.response';

describe('V21 Phase 5 — payroll.response canonical net-salary mapper', () => {
  it('computes basic + allowances − deductions in 4dp for a minimal row', () => {
    expect(
      computePayrollNetSalary({
        basicSalary: new Prisma.Decimal('100.0000'),
        allowances: new Prisma.Decimal('10.0000'),
        deductions: new Prisma.Decimal('5.0000'),
        commissionAmount: new Prisma.Decimal(0),
        debtHoldAmount: new Prisma.Decimal(0),
        debtReleaseAmount: new Prisma.Decimal(0),
        loanDeduction: new Prisma.Decimal(0),
      }),
    ).toBe('105.0000');
  });

  it('adds commission and debtRelease to the credit side', () => {
    expect(
      computePayrollNetSalary({
        basicSalary: new Prisma.Decimal('100'),
        allowances: new Prisma.Decimal('0'),
        deductions: new Prisma.Decimal('0'),
        commissionAmount: new Prisma.Decimal('5'),
        debtHoldAmount: new Prisma.Decimal('0'),
        debtReleaseAmount: new Prisma.Decimal('3'),
        loanDeduction: new Prisma.Decimal('0'),
      }),
    ).toBe('108.0000');
  });

  it('subtracts debtHold and loanDeduction from the debit side', () => {
    expect(
      computePayrollNetSalary({
        basicSalary: new Prisma.Decimal('100'),
        allowances: new Prisma.Decimal('0'),
        deductions: new Prisma.Decimal('5'),
        commissionAmount: new Prisma.Decimal('0'),
        debtHoldAmount: new Prisma.Decimal('10'),
        debtReleaseAmount: new Prisma.Decimal('0'),
        loanDeduction: new Prisma.Decimal('15'),
      }),
    ).toBe('70.0000');
  });

  it('handles null / undefined fields as zero', () => {
    expect(
      computePayrollNetSalary({
        basicSalary: '120',
        allowances: null,
        deductions: undefined,
        commissionAmount: null,
        debtHoldAmount: undefined,
        debtReleaseAmount: null,
        loanDeduction: undefined,
      }),
    ).toBe('120.0000');
  });

  it('accepts string-typed inputs from JSON-cast rows', () => {
    expect(
      computePayrollNetSalary({
        basicSalary: '100.5000',
        allowances: '10.2500',
        deductions: '5.1250',
        commissionAmount: '0',
        debtHoldAmount: '0',
        debtReleaseAmount: '0',
        loanDeduction: '0',
      }),
    ).toBe('105.6250');
  });

  it('mapPayrollRow preserves every original field plus netSalaryKd', () => {
    const row = {
      id: 'p1',
      basicSalary: new Prisma.Decimal('100'),
      allowances: new Prisma.Decimal('5'),
      deductions: new Prisma.Decimal('0'),
      commissionAmount: new Prisma.Decimal('0'),
      debtHoldAmount: new Prisma.Decimal('0'),
      debtReleaseAmount: new Prisma.Decimal('0'),
      loanDeduction: new Prisma.Decimal('0'),
    };
    const out = mapPayrollRow(row);
    expect(out.id).toBe('p1');
    expect(out.netSalaryKd).toBe('105.0000');
  });

  it('computeAdHocNetSalary uses basic + allowances − deductions only', () => {
    expect(
      computeAdHocNetSalary({
        basicSalary: new Prisma.Decimal('100'),
        allowances: new Prisma.Decimal('25'),
        deductions: new Prisma.Decimal('10'),
      }),
    ).toBe('115.0000');
  });

  it('mapPayrollAdHocLine appends netSalaryKd', () => {
    const out = mapPayrollAdHocLine({
      id: 'a1',
      basicSalary: '50',
      allowances: '0',
      deductions: '0',
    });
    expect(out.id).toBe('a1');
    expect(out.netSalaryKd).toBe('50.0000');
  });
});
