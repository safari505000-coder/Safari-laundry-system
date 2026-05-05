import type { ExpenseRow } from '@/lib/api';
import { isCarExpense } from '@/lib/expense-filters';

export type ExpenseBreakdownRow = {
  key: string;
  label: string;
  amount: number;
  count: number;
};

export type ExpenseTrendRow = {
  month: string;
  total: number;
  car: number;
  other: number;
};

export type ExpenseAnalytics = {
  total: number;
  carTotal: number;
  otherTotal: number;
  rowCount: number;
  carCount: number;
  percentage: number;
  monthly: ExpenseTrendRow[];
  byBranch: ExpenseBreakdownRow[];
  byType: ExpenseBreakdownRow[];
  byDriver: ExpenseBreakdownRow[];
};

export function expenseAmount(row: ExpenseRow): number {
  const amount = Number.parseFloat(row.amount);
  return Number.isFinite(amount) ? amount : 0;
}

function monthKey(dateIso: string): string {
  return dateIso.slice(0, 7);
}

function addBreakdown(
  map: Map<string, ExpenseBreakdownRow>,
  key: string,
  label: string,
  amount: number,
): void {
  const current = map.get(key);
  if (current) {
    current.amount += amount;
    current.count += 1;
    return;
  }
  map.set(key, { key, label, amount, count: 1 });
}

function sortedBreakdown(map: Map<string, ExpenseBreakdownRow>): ExpenseBreakdownRow[] {
  return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, 8);
}

export function buildExpenseAnalytics(
  rows: ExpenseRow[],
  options?: {
    noBranchLabel?: string;
  },
): ExpenseAnalytics {
  let total = 0;
  let carTotal = 0;
  let carCount = 0;
  const byMonth = new Map<string, ExpenseTrendRow>();
  const byBranch = new Map<string, ExpenseBreakdownRow>();
  const byType = new Map<string, ExpenseBreakdownRow>();
  const byDriver = new Map<string, ExpenseBreakdownRow>();

  for (const row of rows) {
    const amount = expenseAmount(row);
    const car = isCarExpense(row);
    const month = monthKey(row.expenseDate);
    const monthRow = byMonth.get(month) ?? {
      month,
      total: 0,
      car: 0,
      other: 0,
    };

    total += amount;
    monthRow.total += amount;
    if (car) {
      carTotal += amount;
      carCount += 1;
      monthRow.car += amount;
    } else {
      monthRow.other += amount;
    }
    byMonth.set(month, monthRow);

    addBreakdown(
      byBranch,
      row.branch?.id ?? 'none',
      row.branch?.name ?? options?.noBranchLabel ?? 'No branch',
      amount,
    );
    addBreakdown(byType, row.category, row.category, amount);
    addBreakdown(
      byDriver,
      row.recordedBy.id,
      row.recordedBy.fullName || row.recordedBy.username,
      amount,
    );
  }

  return {
    total,
    carTotal,
    otherTotal: total - carTotal,
    rowCount: rows.length,
    carCount,
    percentage: total > 0 ? (carTotal / total) * 100 : 0,
    monthly: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
    byBranch: sortedBreakdown(byBranch),
    byType: sortedBreakdown(byType),
    byDriver: sortedBreakdown(byDriver),
  };
}
