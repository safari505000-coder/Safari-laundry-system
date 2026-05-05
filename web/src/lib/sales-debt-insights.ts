import type {
  SalesDebtAnalytics,
  SalesDebtGroupRow,
} from '@/lib/sales-debt-analytics';

export type SalesDebtInsightSeverity = 'info' | 'warning' | 'critical';
export type SalesDebtInsightTarget = 'branch' | 'driver';

export type SalesDebtInsight = {
  id: string;
  severity: SalesDebtInsightSeverity;
  message: string;
  target?: SalesDebtInsightTarget;
};

function percent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function highestDebt(rows: SalesDebtGroupRow[]): SalesDebtGroupRow | null {
  return rows.reduce<SalesDebtGroupRow | null>((best, row) => {
    if (row.totalDebt <= 0) return best;
    if (!best || row.totalDebt > best.totalDebt) return row;
    return best;
  }, null);
}

function poorPerformer(rows: SalesDebtGroupRow[]): SalesDebtGroupRow | null {
  return rows
    .filter((row) => row.totalSales > 0 && row.collectionRate < 0.5)
    .sort((a, b) => b.totalDebt - a.totalDebt)[0] ?? null;
}

export function generateSalesDebtInsights(
  analytics: SalesDebtAnalytics,
): SalesDebtInsight[] {
  if (analytics.totals.invoiceCount === 0 || analytics.totals.totalSales <= 0) {
    return [];
  }

  const insights: SalesDebtInsight[] = [];
  const collectionRate = analytics.totals.collectionRate;
  const debtShare =
    analytics.totals.totalSales > 0
      ? analytics.totals.totalDebt / analytics.totals.totalSales
      : 0;

  if (collectionRate < 0.7) {
    insights.push({
      id: 'low-collection',
      severity: collectionRate < 0.45 ? 'critical' : 'warning',
      message: `⚠️ نسبة التحصيل منخفضة (${percent(collectionRate)})`,
    });
  }

  if (debtShare > 0.4) {
    insights.push({
      id: 'high-debt',
      severity: debtShare > 0.6 ? 'critical' : 'warning',
      message: '🚨 المديونية مرتفعة مقارنة بالمبيعات',
    });
  }

  const topRiskBranch = highestDebt(analytics.byBranch);
  if (topRiskBranch) {
    insights.push({
      id: 'top-risk-branch',
      severity:
        topRiskBranch.totalDebt / Math.max(analytics.totals.totalDebt, 1) > 0.5
          ? 'warning'
          : 'info',
      message: `🏢 أعلى فرع مديونية: ${topRiskBranch.name}`,
      target: 'branch',
    });
  }

  const topRiskDriver = highestDebt(analytics.byDriver);
  if (topRiskDriver) {
    insights.push({
      id: 'top-risk-driver',
      severity:
        topRiskDriver.totalDebt / Math.max(analytics.totals.totalDebt, 1) > 0.5
          ? 'warning'
          : 'info',
      message: `🚗 أعلى سائق مديونية: ${topRiskDriver.name}`,
      target: 'driver',
    });
  }

  const weakBranch = poorPerformer(analytics.byBranch);
  if (weakBranch) {
    insights.push({
      id: `poor-branch-${weakBranch.id}`,
      severity: 'warning',
      message: `⚠️ أداء تحصيل ضعيف لدى ${weakBranch.name}`,
      target: 'branch',
    });
  }

  const weakDriver = poorPerformer(analytics.byDriver);
  if (weakDriver) {
    insights.push({
      id: `poor-driver-${weakDriver.id}`,
      severity: 'warning',
      message: `⚠️ أداء تحصيل ضعيف لدى ${weakDriver.name}`,
      target: 'driver',
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: 'healthy',
      severity: 'info',
      message: '✅ التحصيل مستقر ولا توجد مديونية عالية في الفترة الحالية',
    });
  }

  return insights.slice(0, 6);
}
