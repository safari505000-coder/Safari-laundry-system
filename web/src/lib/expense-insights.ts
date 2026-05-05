import type { ExpenseRow } from '@/lib/api';
import {
  buildExpenseAnalytics,
  expenseAmount,
  type ExpenseAnalytics,
} from '@/lib/expense-analytics';

export type ExpenseInsightSeverity = 'info' | 'warning' | 'critical';

export type ExpenseInsight = {
  id: string;
  severity: ExpenseInsightSeverity;
  message: string;
};

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function growth(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return (current - previous) / previous;
}

function splitLoadedRows(rows: ExpenseRow[]): {
  current: ExpenseRow[];
  previous: ExpenseRow[];
} {
  const datedRows = rows
    .map((row) => ({
      row,
      time: new Date(row.expenseDate).getTime(),
    }))
    .filter((item) => Number.isFinite(item.time))
    .sort((a, b) => a.time - b.time);

  if (datedRows.length < 2) return { current: rows, previous: [] };

  const first = datedRows[0]?.time ?? 0;
  const last = datedRows[datedRows.length - 1]?.time ?? first;
  const midpoint = first + (last - first) / 2;

  return {
    previous: datedRows
      .filter((item) => item.time <= midpoint)
      .map((item) => item.row),
    current: datedRows
      .filter((item) => item.time > midpoint)
      .map((item) => item.row),
  };
}

export function generateExpenseInsights(
  rows: ExpenseRow[],
  analytics: ExpenseAnalytics,
): ExpenseInsight[] {
  if (rows.length < 3 || analytics.total <= 0) return [];

  const insights: ExpenseInsight[] = [];
  const { current, previous } = splitLoadedRows(rows);
  const currentAnalytics = buildExpenseAnalytics(current);
  const previousAnalytics = buildExpenseAnalytics(previous);
  const totalGrowth = growth(currentAnalytics.total, previousAnalytics.total);
  const carGrowth = growth(currentAnalytics.carTotal, previousAnalytics.carTotal);
  const dailyAverage = analytics.total / Math.max(1, analytics.monthly.length * 30);
  const recordAverage = analytics.total / Math.max(1, analytics.rowCount);
  const largestRecord = rows.reduce<ExpenseRow | null>((max, row) => {
    if (!max) return row;
    return expenseAmount(row) > expenseAmount(max) ? row : max;
  }, null);

  if (totalGrowth != null && totalGrowth > 0.3) {
    insights.push({
      id: 'total-growth',
      severity: totalGrowth > 0.75 ? 'critical' : 'warning',
      message: `⚠️ المصروفات ارتفعت بنسبة ${formatPercent(totalGrowth)} مقارنة بالفترة السابقة`,
    });
  }

  if (
    totalGrowth != null &&
    carGrowth != null &&
    carGrowth > totalGrowth &&
    carGrowth > 0.2
  ) {
    insights.push({
      id: 'car-growth',
      severity: 'warning',
      message: '🚗 الزيادة الرئيسية من مصروفات السيارات',
    });
  }

  const topBranch = analytics.byBranch[0];
  if (topBranch && topBranch.amount / analytics.total > 0.5) {
    insights.push({
      id: 'top-branch',
      severity: 'info',
      message: `🏢 الفرع الأعلى صرفًا: ${topBranch.label}`,
    });
  }

  const topDriver = analytics.byDriver[0];
  if (topDriver && topDriver.amount / analytics.total > 0.4) {
    insights.push({
      id: 'top-driver',
      severity: topDriver.amount / analytics.total > 0.65 ? 'warning' : 'info',
      message: `👤 أعلى موظف من حيث المصروفات: ${topDriver.label}`,
    });
  }

  if (
    totalGrowth != null &&
    totalGrowth < -0.5 &&
    currentAnalytics.total < previousAnalytics.total
  ) {
    insights.push({
      id: 'unusually-low',
      severity: 'info',
      message: '📉 انخفاض غير معتاد في المصروفات',
    });
  }

  if (largestRecord && expenseAmount(largestRecord) > recordAverage * 2) {
    insights.push({
      id: 'large-record',
      severity: 'warning',
      message: `⚠️ توجد عملية أعلى من ضعفي متوسط العملية: ${largestRecord.title}`,
    });
  }

  const monthlySpike = analytics.monthly.find((month, index, months) => {
    const previousMonth = months[index - 1];
    return (
      previousMonth &&
      previousMonth.total > 0 &&
      month.total > previousMonth.total * 2
    );
  });
  if (monthlySpike) {
    insights.push({
      id: 'monthly-spike',
      severity: 'critical',
      message: `🚨 قفزة مفاجئة في مصروفات شهر ${monthlySpike.month}`,
    });
  }

  if (dailyAverage > 0 && analytics.total < dailyAverage) {
    insights.push({
      id: 'low-volume',
      severity: 'info',
      message: '📉 المصروفات الحالية أقل من المتوسط المتوقع للفترة',
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: 'stable',
      severity: 'info',
      message: '✅ لا توجد مؤشرات غير طبيعية في المصروفات الحالية',
    });
  }

  return insights.slice(0, 6);
}
