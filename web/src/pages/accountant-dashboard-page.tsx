import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  Loader2,
  Minus,
  RefreshCw,
} from 'lucide-react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import {
  ApiError,
  type AccountantDashboardKpi,
  type AccountantDashboardPeriod,
  type AccountantDashboardSummary,
  type FinanceAlertDto,
  type FinanceInsightsResponse,
  type FinanceReconciliationDto,
  type FinanceReconciliationExplainDto,
  explainFinanceReconciliation,
  getAccountantDashboardSummary,
  getFinanceAlerts,
  getFinanceInsights,
  getFinanceReconciliationApi,
} from '@/lib/api';
import {
  absKwdString,
  chartScalarFromKwdString,
  formatKwdLabel,
} from '@/lib/kwd';
import { MetricCard } from '@/components/dashboard/metric-card';
import {
  PageHeader,
  FilterField,
} from '@/modules/shared/components/page';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import { Button } from '@/modules/shared/components/ui/button';
import { Badge } from '@/modules/shared/components/ui/badge';
import { Skeleton } from '@/modules/shared/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/modules/shared/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';
import { cn } from '@/lib/utils';

function trendIcon(dir: AccountantDashboardKpi['trendDirection']) {
  if (dir === 'up') return <ChevronUp className="inline h-4 w-4 text-emerald-600" aria-hidden />;
  if (dir === 'down') return <ChevronDown className="inline h-4 w-4 text-rose-600" aria-hidden />;
  return <Minus className="inline h-3 w-3 text-muted-foreground" aria-hidden />;
}

function stageBorderClass(tone: 'green' | 'yellow' | 'red') {
  if (tone === 'green') return 'border-emerald-500/50 bg-emerald-500/5';
  if (tone === 'yellow') return 'border-amber-500/50 bg-amber-500/5';
  return 'border-rose-500/50 bg-rose-500/5';
}

function severityBadgeClass(s: FinanceAlertDto['severity']) {
  if (s === 'HIGH') return 'bg-rose-600 text-white hover:bg-rose-600';
  if (s === 'MEDIUM') return 'bg-amber-500 text-white hover:bg-amber-500';
  return 'bg-slate-500 text-white hover:bg-slate-500';
}

function reconStatusBadgeClass(s: FinanceReconciliationDto['status']) {
  if (s === 'GREEN') return 'bg-emerald-600 text-white';
  if (s === 'RED') return 'bg-rose-600 text-white';
  return 'bg-amber-500 text-white';
}

function reconCashGapKd(recon: FinanceReconciliationDto): string {
  return absKwdString(recon.shortfallKd);
}

function SimpleLineChart({
  points,
  className,
}: {
  points: { x: number; y: number }[];
  className?: string;
}) {
  if (points.length < 2) {
    return (
      <div className={cn('flex h-32 items-center justify-center text-xs text-muted-foreground', className)}>
        —
      </div>
    );
  }
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y), minY + 0.01);
  const d = points
    .map((p, i) => {
      const px = (i / (points.length - 1)) * 100;
      const py = 100 - ((p.y - minY) / (maxY - minY)) * 100;
      return `${i === 0 ? 'M' : 'L'} ${px.toFixed(2)} ${py.toFixed(2)}`;
    })
    .join(' ');
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={cn('h-32 w-full text-primary', className)}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function GroupedBarMini({
  rows,
  className,
}: {
  rows: { sales: number; exp: number }[];
  className?: string;
}) {
  if (!rows.length) {
    return (
      <div className={cn('flex h-32 items-center justify-center text-xs text-muted-foreground', className)}>
        —
      </div>
    );
  }
  const max = Math.max(...rows.flatMap((r) => [r.sales, r.exp]), 0.01);
  return (
    <div className={cn('flex h-32 items-end gap-0.5', className)}>
      {rows.map((r, i) => (
        <div key={`bar-${i}`} className="flex flex-1 flex-col items-stretch justify-end gap-0.5">
          <div
            className="w-full rounded-sm bg-primary/80"
            style={{ height: `${(r.sales / max) * 100}%`, minHeight: r.sales > 0 ? 4 : 0 }}
            title={`sales ${r.sales}`}
          />
          <div
            className="w-full rounded-sm bg-amber-500/70"
            style={{ height: `${(r.exp / max) * 100}%`, minHeight: r.exp > 0 ? 4 : 0 }}
            title={`exp ${r.exp}`}
          />
        </div>
      ))}
    </div>
  );
}

export function AccountantDashboardPage() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const locale = useAppLocale();
  const navigate = useNavigate();
  const ok = can(user, 'accountantDashboard.view');

  const [period, setPeriod] = useState<AccountantDashboardPeriod>('today');
  const [summary, setSummary] = useState<AccountantDashboardSummary | null>(null);
  const [recon, setRecon] = useState<FinanceReconciliationDto | null>(null);
  const [alerts, setAlerts] = useState<FinanceAlertDto[] | null>(null);
  const [insights, setInsights] = useState<FinanceInsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const [drillTitle, setDrillTitle] = useState<string | null>(null);
  const [drillKind, setDrillKind] = useState<'bags' | 'drivers' | 'generic' | null>(null);

  const [explainOpen, setExplainOpen] = useState(false);
  const [explain, setExplain] = useState<FinanceReconciliationExplainDto | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);

  const loadAll = useCallback(async () => {
    if (!token || !ok) return;
    setError(null);
    setLoading(true);
    try {
      const [s, r, a, i] = await Promise.all([
        getAccountantDashboardSummary(token, { period }),
        getFinanceReconciliationApi(token, { period }),
        getFinanceAlerts(token, { period }),
        getFinanceInsights(token, { period }),
      ]);
      setSummary(s);
      setRecon(r);
      setAlerts(a.alerts);
      setInsights(i);
    } catch (e) {
      const msg =
        e instanceof ApiError ?
          e.message
        : t('accountantDashboard.loadError', 'Could not load dashboard.');
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [token, ok, period, t]);

  useEffect(() => {
    void loadAll();
  }, [loadAll, refreshTick]);

  const pollMs = useMemo(() => {
    const sec = summary?.cacheTtlSec ?? 45;
    return Math.min(60, Math.max(30, sec)) * 1000;
  }, [summary?.cacheTtlSec]);

  useEffect(() => {
    if (!token || !ok) return;
    const id = window.setInterval(() => setRefreshTick((x) => x + 1), pollMs);
    return () => window.clearInterval(id);
  }, [token, ok, pollMs, period]);

  const openDrill = (title: string, kind: 'bags' | 'drivers' | 'generic') => {
    setDrillTitle(title);
    setDrillKind(kind);
  };

  const handleKpiClick = (kpi: AccountantDashboardKpi, label: string) => {
    const d = kpi.drilldownType;
    if (d === 'open_custody_bags') openDrill(label, 'bags');
    else if (d === 'pending_drivers') openDrill(label, 'drivers');
    else
      openDrill(
        label,
        'generic',
      );
  };

  const handleAlertClick = (a: FinanceAlertDto) => {
    if (a.drilldownType === 'open_custody_bags') openDrill(a.title, 'bags');
    else if (a.drilldownType === 'pending_drivers') openDrill(a.title, 'drivers');
    else if (a.drilldownType === 'expense_reports') navigate('/expenses/reports');
    else openDrill(a.title, 'generic');
  };

  const loadExplain = async () => {
    if (!token) return;
    setExplainLoading(true);
    try {
      const data = await explainFinanceReconciliation(token, { period });
      setExplain(data);
      setExplainOpen(true);
    } catch (e) {
      toast.error(
        e instanceof ApiError ?
          e.message
        : t('accountantDashboard.explainError', 'Could not load explanation.'),
      );
    } finally {
      setExplainLoading(false);
    }
  };

  const profitPts = useMemo(() => {
    if (!summary?.charts.profitOverTime.length) return [];
    return summary.charts.profitOverTime.map((p, i) => ({
      x: i,
      y: chartScalarFromKwdString(p.netKd),
    }));
  }, [summary?.charts.profitOverTime]);

  const salesExpRows = useMemo(() => {
    if (!summary) return [];
    return summary.charts.salesVsExpenses.map((r) => ({
      sales: chartScalarFromKwdString(r.salesKd),
      exp: chartScalarFromKwdString(r.expensesKd),
    }));
  }, [summary?.charts.salesVsExpenses]);

  if (!ok) {
    return <Navigate to="/403" replace />;
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-3 pb-10 pt-2 sm:px-4">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <BrainCircuit className="h-6 w-6 shrink-0 text-primary" aria-hidden />
            {t('accountantDashboard.title', 'Accountant dashboard')}
          </span>
        }
        subtitle={t(
          'accountantDashboard.subtitle',
          'KPIs, cash pipeline, reconciliation, and rule-based insights (cached on the server).',
        )}
        tone="blue"
      />

      <div className="flex flex-wrap items-center gap-3">
        <FilterField label={t('accountantDashboard.period', 'Period')}>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['today', t('accountantDashboard.today', 'Today')],
                ['week', t('accountantDashboard.week', 'Week')],
                ['month', t('accountantDashboard.month', 'Month')],
              ] as const
            ).map(([p, label]) => (
              <Button
                key={p}
                type="button"
                size="sm"
                variant={period === p ? 'default' : 'outline'}
                onClick={() => setPeriod(p)}
              >
                {label}
              </Button>
            ))}
          </div>
        </FilterField>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => setRefreshTick((x) => x + 1)}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ms-2">{t('accountantDashboard.refresh', 'Refresh')}</span>
        </Button>
      </div>

      {error ?
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" aria-hidden />
              {t('accountantDashboard.errorTitle', 'Something went wrong')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{error}</CardContent>
        </Card>
      : null}

      {loading && !summary ?
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      : null}

      {summary ?
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <MetricCard
              title={t('accountantDashboard.kpi.sales', 'Total sales')}
              value={formatKwdLabel(summary.kpis.totalSales.valueKd)}
              onClick={() => handleKpiClick(summary.kpis.totalSales, t('accountantDashboard.kpi.sales', 'Total sales'))}
              footer={
                <span className="inline-flex items-center gap-1 tabular-nums">
                  {trendIcon(summary.kpis.totalSales.trendDirection)}
                  {summary.kpis.totalSales.trendPctVsPrevious}%
                </span>
              }
            />
            <MetricCard
              title={t('accountantDashboard.kpi.cashCollected', 'Cash collected')}
              value={formatKwdLabel(summary.kpis.cashCollected.valueKd)}
              onClick={() =>
                handleKpiClick(summary.kpis.cashCollected, t('accountantDashboard.kpi.cashCollected', 'Cash collected'))
              }
              footer={
                <span className="inline-flex items-center gap-1 tabular-nums">
                  {trendIcon(summary.kpis.cashCollected.trendDirection)}
                  {summary.kpis.cashCollected.trendPctVsPrevious}%
                </span>
              }
            />
            <MetricCard
              title={t('accountantDashboard.kpi.cashDrivers', 'Cash with drivers')}
              value={formatKwdLabel(summary.kpis.cashWithDrivers.valueKd)}
              onClick={() =>
                handleKpiClick(
                  summary.kpis.cashWithDrivers,
                  t('accountantDashboard.kpi.cashDrivers', 'Cash with drivers'),
                )
              }
              footer={t('accountantDashboard.snapshotHint', 'Live snapshot')}
            />
            <MetricCard
              title={t('accountantDashboard.kpi.cashManagers', 'Cash with managers')}
              value={formatKwdLabel(summary.kpis.cashWithManagers.valueKd)}
              onClick={() =>
                handleKpiClick(
                  summary.kpis.cashWithManagers,
                  t('accountantDashboard.kpi.cashManagers', 'Cash with managers'),
                )
              }
              footer={
                summary.kpis.cashWithManagers.count != null ?
                  t('accountantDashboard.bagCount', '{{n}} bags', {
                    n: summary.kpis.cashWithManagers.count,
                  })
                : undefined
              }
            />
            <MetricCard
              title={t('accountantDashboard.kpi.bankDeposited', 'Bank deposited')}
              value={formatKwdLabel(summary.kpis.bankDeposited.valueKd)}
              onClick={() =>
                handleKpiClick(
                  summary.kpis.bankDeposited,
                  t('accountantDashboard.kpi.bankDeposited', 'Bank deposited'),
                )
              }
              footer={
                <span className="inline-flex items-center gap-1 tabular-nums">
                  {trendIcon(summary.kpis.bankDeposited.trendDirection)}
                  {summary.kpis.bankDeposited.trendPctVsPrevious}%
                </span>
              }
            />
            <MetricCard
              title={t('accountantDashboard.kpi.netProfit', 'Net profit (GL)')}
              value={formatKwdLabel(summary.kpis.netProfit.valueKd)}
              onClick={() =>
                handleKpiClick(summary.kpis.netProfit, t('accountantDashboard.kpi.netProfit', 'Net profit (GL)'))
              }
              footer={
                <span className="inline-flex items-center gap-1 tabular-nums">
                  {trendIcon(summary.kpis.netProfit.trendDirection)}
                  {summary.kpis.netProfit.trendPctVsPrevious}%
                </span>
              }
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t('accountantDashboard.pipelineTitle', 'Cash flow pipeline')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
                {summary.pipeline.stages.map((s, idx) => (
                  <div key={s.key} className="flex min-w-0 flex-1 items-center gap-2 lg:flex-col lg:items-stretch">
                    <div
                      className={cn(
                        'flex flex-1 flex-col rounded-xl border-2 p-3 transition-colors',
                        stageBorderClass(s.tone),
                      )}
                    >
                      <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums">{formatKwdLabel(s.amountKd)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('accountantDashboard.stageMeta', '{{count}} items · avg delay {{hrs}} h', {
                          count: s.count,
                          hrs: s.avgDelayHours,
                        })}
                      </p>
                    </div>
                    {idx < summary.pipeline.stages.length - 1 ?
                      <ArrowRight
                        className="mx-1 hidden h-6 w-6 shrink-0 text-muted-foreground lg:block"
                        aria-hidden
                      />
                    : null}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
                <CardTitle className="text-base">
                  {t('accountantDashboard.reconTitle', 'Reconciliation')}
                </CardTitle>
                {recon ?
                  <Badge className={reconStatusBadgeClass(recon.status)}>
                    {t('accountantDashboard.cashGap', 'Cash gap')}:{' '}
                    {formatKwdLabel(reconCashGapKd(recon))}
                  </Badge>
                : loading ?
                  <Skeleton className="h-6 w-24" />
                : null}
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {recon ?
                  <>
                    <div className="grid grid-cols-2 gap-2 tabular-nums">
                      <div>
                        <p className="text-muted-foreground">{t('accountantDashboard.collected', 'Collected')}</p>
                        <p className="font-medium">{formatKwdLabel(recon.collected.kd)}</p>
                        <p className="text-xs text-muted-foreground">
                          {recon.collected.orderCount} {t('accountantDashboard.orders', 'orders')}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t('accountantDashboard.handed', 'Handed')}</p>
                        <p className="font-medium">{formatKwdLabel(recon.handed.kd)}</p>
                        <p className="text-xs text-muted-foreground">
                          {recon.handed.bagCount} {t('accountantDashboard.bags', 'bags')}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">
                          {t('accountantDashboard.pendingDrivers', 'Pending drivers')}
                        </p>
                        <p className="font-medium">{formatKwdLabel(recon.pendingDrivers.kd)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">
                          {t('accountantDashboard.pendingManagers', 'Pending managers')}
                        </p>
                        <p className="font-medium">{formatKwdLabel(recon.pendingManagers.kd)}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {recon.status === 'RED' ?
                        t('accountantDashboard.gapDrivers', 'Drivers currently hold {{kd}} KWD', {
                          kd: formatKwdLabel(reconCashGapKd(recon)),
                        })
                      : recon.status === 'YELLOW' ?
                        t(
                          'accountantDashboard.gapOffice',
                          'Office holds {{kd}} KWD (pending reconciliation)',
                          { kd: formatKwdLabel(reconCashGapKd(recon)) },
                        )
                      : t('accountantDashboard.gapBalanced', 'Collected and handed are balanced for this window.')}
                    </p>
                    <Button type="button" variant="secondary" size="sm" disabled={explainLoading} onClick={loadExplain}>
                      {explainLoading ?
                        <Loader2 className="h-4 w-4 animate-spin" />
                      : <BrainCircuit className="h-4 w-4" />}
                      <span className="ms-2">
                        {t('accountantDashboard.explainButton', 'Explain difference')}
                      </span>
                    </Button>
                  </>
                : loading ?
                  <Skeleton className="h-24 w-full" />
                : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('accountantDashboard.alertsTitle', 'Alerts')}</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[320px] space-y-2 overflow-y-auto text-sm">
                {alerts?.length ?
                  alerts.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => handleAlertClick(a)}
                      className="flex w-full items-start gap-2 rounded-lg border border-border/80 bg-card p-2 text-start transition-colors hover:bg-muted/40"
                    >
                      <Badge className={severityBadgeClass(a.severity)}>{a.severity}</Badge>
                      <span>
                        <span className="font-medium">{a.title}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{a.detail}</span>
                      </span>
                    </button>
                  ))
                : loading ?
                  <Skeleton className="h-20 w-full" />
                : (
                  <p className="text-muted-foreground">{t('accountantDashboard.noAlerts', 'No alerts.')}</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('accountantDashboard.insightsTitle', 'Insights')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {insights?.lines.length ?
                insights.lines.map((line, i) => (
                  <p key={`insight-${i}`} className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                    {line}
                  </p>
                ))
              : loading ?
                <Skeleton className="h-16 w-full" />
              : (
                <p className="text-muted-foreground">{t('accountantDashboard.noInsights', 'No insights for this window.')}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('accountantDashboard.expensesTitle', 'Expenses & ratio')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">{t('accountantDashboard.totalExpenses', 'Total expenses')}</p>
                <p className="text-lg font-semibold tabular-nums">{formatKwdLabel(summary.expenses.totalKd)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('accountantDashboard.topCategory', 'Top category')}</p>
                <p className="text-lg font-semibold">{summary.expenses.topCategory ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('accountantDashboard.expenseRatio', 'Expense / sales')}</p>
                <p className="text-lg font-semibold tabular-nums">
                  {summary.expenses.expenseRatioVsSales ?
                    `${(Number(summary.expenses.expenseRatioVsSales) * 100).toFixed(1)}%`
                  : '—'}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t('accountantDashboard.chartProfit', 'Profit over time')}</CardTitle>
              </CardHeader>
              <CardContent>
                <SimpleLineChart points={profitPts} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t('accountantDashboard.chartSalesExp', 'Sales vs expenses')}</CardTitle>
              </CardHeader>
              <CardContent>
                <GroupedBarMini rows={salesExpRows} />
                <p className="mt-2 text-center text-[10px] text-muted-foreground">
                  {t('accountantDashboard.legendSalesExp', 'Blue = sales · Amber = expenses')}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t('accountantDashboard.chartCashFlow', 'Collected vs handed (daily)')}</CardTitle>
              </CardHeader>
              <CardContent>
                <SimpleLineChart
                  points={summary.charts.cashStagesTrend.map((p, i) => ({
                    x: i,
                    y: chartScalarFromKwdString(p.collectedKd),
                  }))}
                />
                <p className="mt-2 text-[10px] text-muted-foreground">
                  {t('accountantDashboard.chartCashHint', 'Composite trend; use reconciliation for exact KD.')}
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      : null}

      <Dialog
        open={!!drillTitle && !!drillKind}
        onOpenChange={(open) => {
          if (!open) {
            setDrillTitle(null);
            setDrillKind(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{drillTitle}</DialogTitle>
          </DialogHeader>
          {drillKind === 'bags' && summary ?
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('accountantDashboard.col.manager', 'Manager')}</TableHead>
                  <TableHead>{t('accountantDashboard.col.driver', 'Driver')}</TableHead>
                  <TableHead>{t('accountantDashboard.col.amount', 'Amount')}</TableHead>
                  <TableHead>{t('accountantDashboard.col.status', 'Status')}</TableHead>
                  <TableHead>{t('accountantDashboard.col.age', 'Age (h)')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.drilldowns.openCustodyBags.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.managerName}</TableCell>
                    <TableCell>{row.driverName}</TableCell>
                    <TableCell className="tabular-nums">{formatKwdLabel(row.amountKd)}</TableCell>
                    <TableCell>
                      {row.status}
                      {row.isOverdue ? <Badge className="ms-2 bg-amber-600">!</Badge> : null}
                    </TableCell>
                    <TableCell>{row.ageHours}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          : null}
          {drillKind === 'drivers' && summary ?
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('accountantDashboard.col.driver', 'Driver')}</TableHead>
                  <TableHead>{t('accountantDashboard.col.pending', 'Pending')}</TableHead>
                  <TableHead>{t('accountantDashboard.col.lastDelivery', 'Last completed')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.drilldowns.pendingDrivers.map((row) => (
                  <TableRow key={row.driverId}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className="tabular-nums">{formatKwdLabel(row.pendingKd)}</TableCell>
                    <TableCell>
                      {new Date(row.lastCompletedAt).toLocaleString(locale, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          : null}
          {drillKind === 'generic' ?
            <p className="text-sm text-muted-foreground">
              {t(
                'accountantDashboard.drillGeneric',
                'This metric is aggregated. Use Money flow, unified ledger, or driver cash trace for detailed lines.',
              )}
            </p>
          : null}
        </DialogContent>
      </Dialog>

      <Dialog open={explainOpen} onOpenChange={setExplainOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('accountantDashboard.explainTitle', 'Explain reconciliation difference')}</DialogTitle>
          </DialogHeader>
          {explain ?
            <div className="space-y-4 text-sm">
              {explain.summaryLabels.driverHoldsLine || explain.summaryLabels.officeHoldsLine ?
                <div className="space-y-1 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm font-medium">
                  {explain.summaryLabels.driverHoldsLine ?
                    <p>{explain.summaryLabels.driverHoldsLine}</p>
                  : null}
                  {explain.summaryLabels.officeHoldsLine ?
                    <p>{explain.summaryLabels.officeHoldsLine}</p>
                  : null}
                </div>
              : null}
              <p className="text-xs text-muted-foreground tabular-nums">
                {t('accountantDashboard.explainTotals', 'Window: shortfall {{sf}} KWD · delta {{d}} KWD', {
                  sf: formatKwdLabel(explain.totalShortfallKd),
                  d: formatKwdLabel(explain.totalDeltaKd),
                })}
              </p>
              {explain.narratives.map((n, i) => (
                <p key={`narrative-${i}`} className="rounded-md border bg-muted/30 px-3 py-2">
                  {n}
                </p>
              ))}
              <div>
                <p className="mb-2 font-medium">{t('accountantDashboard.byDate', 'By date')}</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('accountantDashboard.col.day', 'Day')}</TableHead>
                      <TableHead>{t('accountantDashboard.collected', 'Collected')}</TableHead>
                      <TableHead>{t('accountantDashboard.handed', 'Handed')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {explain.byDate.map((r) => (
                      <TableRow key={r.day}>
                        <TableCell>{r.day}</TableCell>
                        <TableCell className="tabular-nums">{formatKwdLabel(r.collectedKd)}</TableCell>
                        <TableCell className="tabular-nums">{formatKwdLabel(r.handedKd)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div>
                <p className="mb-2 font-medium">{t('accountantDashboard.byDriver', 'By driver')}</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('accountantDashboard.col.driver', 'Driver')}</TableHead>
                      <TableHead>{t('accountantDashboard.collected', 'Collected')}</TableHead>
                      <TableHead>{t('accountantDashboard.handed', 'Handed')}</TableHead>
                      <TableHead>{t('accountantDashboard.colShortfall', 'Shortfall')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {explain.byDriver.map((r) => (
                      <TableRow key={r.driverId}>
                        <TableCell>{r.name}</TableCell>
                        <TableCell className="tabular-nums">{formatKwdLabel(r.collectedKd)}</TableCell>
                        <TableCell className="tabular-nums">{formatKwdLabel(r.handedKd)}</TableCell>
                        <TableCell className="tabular-nums">{formatKwdLabel(r.shortfallKd)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div>
                <p className="mb-2 font-medium">{t('accountantDashboard.byManager', 'By manager')}</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('accountantDashboard.col.manager', 'Manager')}</TableHead>
                      <TableHead>{t('accountantDashboard.handed', 'Handed')}</TableHead>
                      <TableHead>{t('accountantDashboard.bags', 'Bags')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {explain.byManager.map((r) => (
                      <TableRow key={r.managerId}>
                        <TableCell>{r.name}</TableCell>
                        <TableCell className="tabular-nums">{formatKwdLabel(r.handedKd)}</TableCell>
                        <TableCell>{r.bagCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
