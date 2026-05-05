import type { ExpenseRow } from '@/lib/api';
import {
  buildExpenseAnalytics,
  type ExpenseAnalytics,
} from '@/lib/expense-analytics';
import { generateExpenseInsights, type ExpenseInsight } from '@/lib/expense-insights';

export type WeeklyExpenseReportPeriod = 'last7Days' | 'previousCalendarWeek';

export type WeeklyExpenseDateRange = {
  from: Date;
  to: Date;
};

export type WeeklyExpenseReport = {
  title: string;
  generatedAt: string;
  range: {
    from: string;
    to: string;
  };
  rows: ExpenseRow[];
  analytics: ExpenseAnalytics;
  insights: ExpenseInsight[];
};

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

export function resolveWeeklyExpenseRange(
  period: WeeklyExpenseReportPeriod = 'last7Days',
  now = new Date(),
): WeeklyExpenseDateRange {
  if (period === 'previousCalendarWeek') {
    const today = startOfDay(now);
    const day = today.getDay();
    const daysSinceMonday = (day + 6) % 7;
    const currentMonday = new Date(today);
    currentMonday.setDate(today.getDate() - daysSinceMonday);
    const previousMonday = new Date(currentMonday);
    previousMonday.setDate(currentMonday.getDate() - 7);
    const previousSunday = new Date(previousMonday);
    previousSunday.setDate(previousMonday.getDate() + 6);

    return {
      from: previousMonday,
      to: endOfDay(previousSunday),
    };
  }

  const to = endOfDay(now);
  const from = startOfDay(now);
  from.setDate(from.getDate() - 6);
  return { from, to };
}

export function buildWeeklyReport(
  rows: ExpenseRow[],
  dateRange: WeeklyExpenseDateRange = resolveWeeklyExpenseRange(),
): WeeklyExpenseReport {
  const fromMs = dateRange.from.getTime();
  const toMs = dateRange.to.getTime();
  const weeklyRows = rows.filter((row) => {
    const rowTime = new Date(row.expenseDate).getTime();
    return Number.isFinite(rowTime) && rowTime >= fromMs && rowTime <= toMs;
  });
  const analytics = buildExpenseAnalytics(weeklyRows, {
    noBranchLabel: 'بدون فرع',
  });

  return {
    title: 'التقرير الأسبوعي للمصروفات',
    generatedAt: new Date().toISOString(),
    range: {
      from: dateRange.from.toISOString(),
      to: dateRange.to.toISOString(),
    },
    rows: weeklyRows,
    analytics,
    insights: generateExpenseInsights(weeklyRows, analytics),
  };
}
