import { useMemo } from 'react';
import { AlertTriangle, Info, Siren } from 'lucide-react';
import type { SalesDebtAnalytics } from '@/lib/sales-debt-analytics';
import {
  generateSalesDebtInsights,
  type SalesDebtInsightSeverity,
  type SalesDebtInsightTarget,
} from '@/lib/sales-debt-insights';
import { cn } from '@/lib/utils';
import { Button } from '@/modules/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';

type SalesDebtInsightsPanelProps = {
  analytics: SalesDebtAnalytics;
  onDrillDown?: (target: SalesDebtInsightTarget) => void;
};

function severityIcon(severity: SalesDebtInsightSeverity) {
  if (severity === 'critical') return Siren;
  if (severity === 'warning') return AlertTriangle;
  return Info;
}

export function SalesDebtInsightsPanel({
  analytics,
  onDrillDown,
}: SalesDebtInsightsPanelProps) {
  const insights = useMemo(() => generateSalesDebtInsights(analytics), [analytics]);

  if (insights.length === 0) {
    return (
      <Card>
        <CardContent className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center">
          <p className="text-sm font-medium">لا توجد بيانات كافية للتحليل</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">رؤى المبيعات والمديونية</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {insights.map((insight) => {
          const Icon = severityIcon(insight.severity);
          return (
            <div
              key={insight.id}
              className={cn(
                'flex flex-col gap-2 rounded-xl border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between',
                insight.severity === 'critical' &&
                  'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200',
                insight.severity === 'warning' &&
                  'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200',
                insight.severity === 'info' &&
                  'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200',
              )}
            >
              <div className="flex items-start gap-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{insight.message}</span>
              </div>
              {insight.target ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 self-start bg-background/70 sm:self-auto"
                  onClick={() => {
                    if (insight.target) onDrillDown?.(insight.target);
                  }}
                >
                  عرض التفاصيل
                </Button>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
