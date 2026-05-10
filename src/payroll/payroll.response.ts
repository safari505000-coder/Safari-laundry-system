import { Prisma } from '@prisma/client';

/**
 * V21 Phase 5 — canonical payroll-row net-salary mapper.
 *
 * Every printable payroll surface (payslip, monthly roster, monthly
 * summary print, full monthly report print) used to compute
 *   `net = basic + allowances + commission + debtRelease
 *          − deductions − debtHold − loanDeduction`
 * locally via `parseFloat`. That is frontend financial reconstruction
 * and was the last legacy site for payroll display.
 *
 * `mapPayrollRow` keeps the entire Prisma payload but appends a
 * backend-computed `netSalaryKd` field at 4dp Decimal precision. Both
 * the list endpoint and the single-row payslip endpoint now go through
 * this mapper so the frontend renders the value verbatim through the
 * canonical `formatKwdLabel` from `@/lib/kwd`.
 *
 * Ad-hoc roster lines (no User) use `mapPayrollAdHocLine` which omits
 * commission/debtHold/loanDeduction (those bands don't apply to
 * arbitrary one-off beneficiaries) and emits the same `netSalaryKd`
 * field for uniform rendering.
 */

type DecOrString = Prisma.Decimal | string | null | undefined;

export type PayrollRowLike = {
  basicSalary: DecOrString;
  allowances: DecOrString;
  deductions: DecOrString;
  commissionAmount: DecOrString;
  debtHoldAmount: DecOrString;
  debtReleaseAmount: DecOrString;
  loanDeduction: DecOrString;
};

export type PayrollAdHocLineLike = {
  basicSalary: DecOrString;
  allowances: DecOrString;
  deductions: DecOrString;
};

function dec(v: DecOrString): Prisma.Decimal {
  if (v == null) return new Prisma.Decimal(0);
  if (v instanceof Prisma.Decimal) return v;
  if (v === '') return new Prisma.Decimal(0);
  return new Prisma.Decimal(v);
}

export function computePayrollNetSalary(row: PayrollRowLike): string {
  const positive = dec(row.basicSalary)
    .add(dec(row.allowances))
    .add(dec(row.commissionAmount))
    .add(dec(row.debtReleaseAmount));
  const negative = dec(row.deductions)
    .add(dec(row.debtHoldAmount))
    .add(dec(row.loanDeduction));
  return positive.sub(negative).toFixed(4);
}

export function computeAdHocNetSalary(row: PayrollAdHocLineLike): string {
  const net = dec(row.basicSalary)
    .add(dec(row.allowances))
    .sub(dec(row.deductions));
  return net.toFixed(4);
}

export function mapPayrollRow<T extends PayrollRowLike>(
  row: T,
): T & { netSalaryKd: string } {
  return { ...row, netSalaryKd: computePayrollNetSalary(row) };
}

export function mapPayrollRows<T extends PayrollRowLike>(
  rows: T[],
): Array<T & { netSalaryKd: string }> {
  return rows.map(mapPayrollRow);
}

export function mapPayrollAdHocLine<T extends PayrollAdHocLineLike>(
  row: T,
): T & { netSalaryKd: string } {
  return { ...row, netSalaryKd: computeAdHocNetSalary(row) };
}

export function mapPayrollAdHocLines<T extends PayrollAdHocLineLike>(
  rows: T[],
): Array<T & { netSalaryKd: string }> {
  return rows.map(mapPayrollAdHocLine);
}
