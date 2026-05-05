import type { ExpenseRow } from '@/lib/api';

export type ExpensePageMode = 'default' | 'reports' | 'cars';
export type ExpenseViewType = 'all' | 'car';

const CAR_EXPENSE_CATEGORIES = new Set(['CAR', 'VEHICLE', 'FUEL']);

type ExpenseRowWithType = ExpenseRow & {
  type?: string | null;
  expenseType?: string | null;
};

function normalizeExpenseType(type: string | null | undefined): ExpenseViewType {
  return type === 'car' ? 'car' : 'all';
}

export function isCarExpense(row: ExpenseRow): boolean {
  const candidate = row as ExpenseRowWithType;
  const type = candidate.type?.toUpperCase();
  const expenseType = candidate.expenseType?.toUpperCase();
  const category = candidate.category.toUpperCase();

  return (
    type === 'CAR' ||
    type === 'VEHICLE' ||
    expenseType === 'CAR' ||
    expenseType === 'VEHICLE' ||
    CAR_EXPENSE_CATEGORIES.has(category)
  );
}

export function buildExpenseFilter({
  mode,
  type,
}: {
  mode: ExpensePageMode;
  type?: string | null;
}): {
  type: ExpenseViewType;
  matches: (row: ExpenseRow) => boolean;
} {
  const normalizedType = mode === 'cars' ? 'car' : normalizeExpenseType(type);

  return {
    type: normalizedType,
    matches: (row) => normalizedType === 'all' || isCarExpense(row),
  };
}
