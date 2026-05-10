import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  BarChart3,
  CircleDollarSign,
  Info,
  Loader2,
  PieChart,
  Siren,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  ApiError,
  getExpensesSummary,
  type ExpenseRow,
  type ExpensesSummaryAlert,
  type ExpensesSummaryByBranch,
  type ExpensesSummaryByCategory,
  type ExpensesSummaryByOwner,
  type ExpensesSummaryMonthly,
  type ExpensesSummaryResponse,
} from '@/lib/api';
import { WeeklyExpenseReportActions } from '@/components/expenses/weekly-expense-report-actions';
import { chartScalarFromKwdString, formatKwdLabel } from '@/lib/kwd';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * STRICT ROLE-BASED EXPENSE DESIGN — Parts 3, 5, 6, 7, 8.
 *
 * This panel renders FINANCIAL data — totals, category / owner / branch
 * breakdowns, monthly trends and server-computed alerts. Visible only
 * to OWNER / GENERAL_MANAGER / ACCOUNTANT.
 *
 * SSoT contract:
 *   - Every numeric value comes verbatim from the response of
 *     `GET /api/finance/expenses-summary` (`getExpensesSummary`). The
 *     component performs ZERO arithmetic over expense rows — no
 *     `reduce()`, no `sum()`, no manual `%`. Frontend math on expense
 *     rows is forbidden by the lint rules in `web/eslint.config.js`.
 *   - The `rows` prop is kept only so the legacy
 *     `<WeeklyExpenseReportActions>` can build print exports; nothing
 *     in this file derives totals from it.
 *
 * Defense-in-depth: the call site in `expenses-page.tsx` already
 * skips this panel for `MANAGER`. We additionally short-circuit here
 * if the role is MANAGER, because a future caller may forget the
 * outer guard.
 */

type ExpensesAnalyticsDashboardProps = {
  rows: ExpenseRow[];
  fromIso: string;
  toIso: string;
  branchId?: string;
};

function KpiCard({
  label,
  value,
  hint,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  tone: 'blue' | 'emerald' | 'amber' | 'rose';
  icon: typeof CircleDollarSign;
}) {
  const toneClass = {
    blue: 'bg-sky-50 text-sky-800 border-sky-100 dark:bg-sky-950/30 dark:text-sky-200 dark:border-sky-900/40',
    emerald:
      'bg-emerald-50 text-emerald-800 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900/40',
    amber:
      'bg-amber-50 text-amber-800 border-amber-100 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900/40',
    rose: 'bg-rose-50 text-rose-800 border-rose-100 dark:bg-rose-950/30 dark:text-rose-200 dark:border-rose-900/40',
  }[tone];

  return (
    <Card className={cn('border', toneClass)}>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div>
          <p className="text-xs font-medium opacity-80">{label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
          <p className="mt-1 text-xs opacity-75">{hint}</p>
        </div>
        <Icon className="h-5 w-5 shrink-0 opacity-75" aria-hidden />
      </CardContent>
    </Card>
  );
}

function HorizontalBars({
  rows,
  emptyLabel,
  labelOf,
}: {
  rows: { key: string; totalKd: string; count: number }[];
  emptyLabel: string;
  labelOf: (key: string) => string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  const max = chartScalarFromKwdString(rows[0]?.totalKd);

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const value = chartScalarFromKwdString(row.totalKd);
        const width = max > 0 ? Math.max(6, (value / max) * 100) : 0;
        return (
          <div key={row.key} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate font-medium">{labelOf(row.key)}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatKwdLabel(row.totalKd)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthlyTrendBars({
  rows,
  emptyLabel,
}: {
  rows: ExpensesSummaryMonthly[];
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  const maxTotal = rows.reduce((m, r) => {
    const v = chartScalarFromKwdString(r.totalKd);
    return v > m ? v : m;
  }, 0);
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const total = chartScalarFromKwdString(row.totalKd);
        const branch = chartScalarFromKwdString(row.branchKd);
        const driver = chartScalarFromKwdString(row.driverKd);
        const company = chartScalarFromKwdString(row.companyKd);
        const totalWidth = maxTotal > 0 ? Math.max(8, (total / maxTotal) * 100) : 0;
        const branchPct = total > 0 ? (branch / total) * 100 : 0;
        const driverPct = total > 0 ? (driver / total) * 100 : 0;
        const companyPct = total > 0 ? (company / total) * 100 : 0;
        return (
          <div
            key={row.month}
            className="grid gap-2 sm:grid-cols-[96px_1fr_120px] sm:items-center"
          >
            <span className="text-xs font-medium text-muted-foreground">
              {row.month}
            </span>
            <div
              className="flex h-3 overflow-hidden rounded-full bg-muted"
              style={{ width: `${totalWidth}%` }}
            >
              <div className="bg-sky-500" style={{ width: `${branchPct}%` }} />
              <div className="bg-amber-500" style={{ width: `${driverPct}%` }} />
              <div className="bg-emerald-500" style={{ width: `${companyPct}%` }} />
            </div>
            <span className="text-xs font-semibold tabular-nums sm:text-end">
              {formatKwdLabel(row.totalKd)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function severityIcon(severity: ExpensesSummaryAlert['severity']) {
  if (severity === 'critical') return Siren;
  if (severity === 'warning') return AlertTriangle;
  return Info;
}

function AlertsPanel({ alerts }: { alerts: ExpensesSummaryAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Server alerts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.map((alert) => {
          const Icon = severityIcon(alert.severity);
          return (
            <div
              key={alert.id}
              className={cn(
                'flex items-start gap-3 rounded-xl border px-3 py-2 text-sm',
                alert.severity === 'critical' &&
                  'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200',
                alert.severity === 'warning' &&
                  'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200',
                alert.severity === 'info' &&
                  'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200',
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{alert.message}</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

const OWNER_TYPE_LABELS: Record<string, string> = {
  BRANCH: 'Branch expenses',
  DRIVER: 'Driver expenses',
  COMPANY: 'Company expenses',
};

export function ExpensesAnalyticsDashboard({
  rows,
  fromIso,
  toIso,
  branchId,
}: ExpensesAnalyticsDashboardProps) {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const [summary, setSummary] = useState<ExpensesSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Defense-in-depth: never render financial aggregates to a branch
  // manager, regardless of how this component was reached.
  const blockedForRole = user?.safariRole === 'MANAGER';

  useEffect(() => {
    if (!token || blockedForRole) return;
    let cancelled = false;
    // Schedule the loading flag asynchronously so the synchronous
    // setState happens outside the effect body (react-hooks rule).
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      return getExpensesSummary(token, { from: fromIso, to: toIso, branchId })
        .then((data) => {
          if (!cancelled) setSummary(data);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          if (err instanceof ApiError) setError(err.message);
          else setError('Failed to load expense summary');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [token, fromIso, toIso, branchId, blockedForRole]);

  const ownerLookup = useMemo(() => {
    const map = new Map<string, ExpensesSummaryByOwner>();
    for (const row of summary?.byOwnerType ?? []) {
      map.set(row.ownerType, row);
    }
    return map;
  }, [summary]);

  if (blockedForRole) return null;

  if (loading && !summary) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          <span>Loading expense summary…</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-6 text-center text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </CardContent>
      </Card>
    );
  }

  if (!summary || summary.approvedCount === 0) {
    return (
      <Card>
        <CardContent className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-10 text-center">
          <p className="text-sm font-medium">{t('expenses.analytics.empty')}</p>
        </CardContent>
      </Card>
    );
  }

  const branchKpi = ownerLookup.get('BRANCH');
  const driverKpi = ownerLookup.get('DRIVER');
  const companyKpi = ownerLookup.get('COMPANY');

  return (
    <div className="space-y-4">
      <WeeklyExpenseReportActions rows={rows} summary={summary} />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={t('expenses.analytics.total')}
          value={formatKwdLabel(summary.totalApprovedKd)}
          hint={`${summary.approvedCount} approved`}
          tone="blue"
          icon={CircleDollarSign}
        />
        <KpiCard
          label={OWNER_TYPE_LABELS.BRANCH}
          value={formatKwdLabel(branchKpi?.totalKd ?? '0')}
          hint={`${branchKpi?.count ?? 0} entries`}
          tone="emerald"
          icon={PieChart}
        />
        <KpiCard
          label={OWNER_TYPE_LABELS.DRIVER}
          value={formatKwdLabel(driverKpi?.totalKd ?? '0')}
          hint={`${driverKpi?.count ?? 0} entries`}
          tone="amber"
          icon={BarChart3}
        />
        <KpiCard
          label={OWNER_TYPE_LABELS.COMPANY}
          value={formatKwdLabel(companyKpi?.totalKd ?? '0')}
          hint={`${companyKpi?.count ?? 0} entries`}
          tone="rose"
          icon={CircleDollarSign}
        />
      </div>

      <AlertsPanel alerts={summary.alerts} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4" aria-hidden />
            {t('expenses.analytics.monthlyTrend')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyTrendBars
            rows={summary.monthly}
            emptyLabel={t('expenses.analytics.empty')}
          />
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              {OWNER_TYPE_LABELS.BRANCH}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              {OWNER_TYPE_LABELS.DRIVER}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {OWNER_TYPE_LABELS.COMPANY}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('expenses.analytics.byBranch')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBars
              rows={summary.byBranch.map((row: ExpensesSummaryByBranch) => ({
                key: row.branchId ?? '__unattributed__',
                totalKd: row.totalKd,
                count: row.count,
              }))}
              emptyLabel={t('expenses.analytics.empty')}
              labelOf={(key) =>
                summary.byBranch.find(
                  (row) => (row.branchId ?? '__unattributed__') === key,
                )?.branchName ??
                t('expenses.analytics.noBranch')
              }
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('expenses.analytics.byType')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBars
              rows={summary.byCategory.map((row: ExpensesSummaryByCategory) => ({
                key: row.category,
                totalKd: row.totalKd,
                count: row.count,
              }))}
              emptyLabel={t('expenses.analytics.empty')}
              labelOf={(key) => key}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
