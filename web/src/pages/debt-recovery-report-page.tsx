import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import {
  Calendar,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/modules/shared/components/ui/button';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';
import { useAuth } from '@/contexts/auth-context';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import { type DebtRecoveryReport, apiJson, ApiError } from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { cn } from '@/lib/utils';

const DEFAULT_WINDOW_DAYS = 30;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function subtractDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() - days);
  return next;
}

/**
 * Dastur §5 — Owner-only Debt Recovery Report.
 * Time-series of debt settled via the Call Center island so the Owner can
 * see recovery performance over time. No net-profit data here.
 */
export function DebtRecoveryReportPage() {
  const { t } = useTranslation();
  const locale = useAppLocale();
  const { token, hasRole } = useAuth();
  const isOwner = hasRole('OWNER');

  const todayIso = useMemo(() => isoDay(new Date()), []);
  const defaultFromIso = useMemo(
    () => isoDay(subtractDays(new Date(), DEFAULT_WINDOW_DAYS - 1)),
    [],
  );

  const [fromIso, setFromIso] = useState(defaultFromIso);
  const [toIso, setToIso] = useState(todayIso);
  const [report, setReport] = useState<DebtRecoveryReport | null>(null);
  const [loading, setLoading] = useState(false);

  const dayFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
      }),
    [locale],
  );

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token || !isOwner) return;
      if (!opts?.silent) setLoading(true);
      try {
        const params = new URLSearchParams();
        if (fromIso) params.set('from', fromIso);
        if (toIso) params.set('to', toIso);
        const data = await apiJson<DebtRecoveryReport>(
          `/api/call-center/debt-recovery-report?${params.toString()}`,
          { token },
        );
        setReport(data);
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [token, isOwner, fromIso, toIso],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (!isOwner) {
    return <Navigate to="/" replace />;
  }

  const days = report?.days ?? [];
  const totalSettlements = days.reduce((acc, d) => acc + d.settlementCount, 0);
  const totalSubscriptions = days.reduce(
    (acc, d) => acc + d.subscriptionCount,
    0,
  );

  // Compute the max recovered value for a simple inline bar scale.
  const maxRecovered = days.reduce((acc, d) => {
    const n = Number.parseFloat(d.recoveredKd);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-2 py-4 sm:space-y-6 sm:px-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('debtRecovery.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('debtRecovery.subtitle')}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? (
            <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="me-2 h-4 w-4" aria-hidden />
          )}
          {t('debtRecovery.refresh')}
        </Button>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/40">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200">
              <TrendingUp className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                {t('debtRecovery.totalRecovered')}
              </p>
              <p className="text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-200">
                {report ? formatKwdLabel(report.totalRecoveredKd) : '—'}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-200">
              <Calendar className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                {t('debtRecovery.settlementsCount')}
              </p>
              <p className="text-2xl font-semibold tabular-nums">
                {report ? totalSettlements : '—'}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-200">
              <Sparkles className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                {t('debtRecovery.subscriptionsCount')}
              </p>
              <p className="text-2xl font-semibold tabular-nums">
                {report ? totalSubscriptions : '—'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="dr-from">{t('debtRecovery.filterFrom')}</Label>
            <Input
              id="dr-from"
              type="date"
              value={fromIso}
              max={toIso}
              onChange={(e) => setFromIso(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dr-to">{t('debtRecovery.filterTo')}</Label>
            <Input
              id="dr-to"
              type="date"
              value={toIso}
              min={fromIso}
              max={todayIso}
              onChange={(e) => setToIso(e.target.value)}
            />
          </div>
          <Button
            type="button"
            className="h-10"
            disabled={loading}
            onClick={() => void load()}
          >
            {t('debtRecovery.apply')}
          </Button>
        </div>
      </section>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('debtRecovery.colDay')}</TableHead>
              <TableHead className="text-end tabular-nums">
                {t('debtRecovery.colRecovered')}
              </TableHead>
              <TableHead className="text-end tabular-nums">
                {t('debtRecovery.colSettlements')}
              </TableHead>
              <TableHead className="text-end tabular-nums">
                {t('debtRecovery.colSubscriptions')}
              </TableHead>
              <TableHead className="min-w-[140px]">
                {t('debtRecovery.colTrend')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !report ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center">
                  <Loader2
                    className="mx-auto h-7 w-7 animate-spin text-muted-foreground"
                    aria-hidden
                  />
                </TableCell>
              </TableRow>
            ) : days.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  {t('debtRecovery.empty')}
                </TableCell>
              </TableRow>
            ) : (
              days.map((d) => {
                const n = Number.parseFloat(d.recoveredKd);
                const ratio =
                  maxRecovered > 0 && Number.isFinite(n) ? n / maxRecovered : 0;
                const displayDate = (() => {
                  const dt = new Date(`${d.dayIso}T00:00:00.000Z`);
                  return Number.isNaN(dt.getTime())
                    ? d.dayIso
                    : dayFmt.format(dt);
                })();
                return (
                  <TableRow key={d.dayIso}>
                    <TableCell className="tabular-nums">
                      <span className="font-medium">{displayDate}</span>
                      <span className="ms-2 text-[11px] text-muted-foreground">
                        {d.dayIso}
                      </span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-end tabular-nums font-medium',
                        n > 0 && 'text-emerald-700 dark:text-emerald-200',
                      )}
                    >
                      {formatKwdLabel(d.recoveredKd)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {d.settlementCount}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {d.subscriptionCount}
                    </TableCell>
                    <TableCell>
                      <div
                        className="relative h-2 overflow-hidden rounded-full bg-muted"
                        aria-hidden
                      >
                        <div
                          className={cn(
                            'absolute inset-y-0 start-0 rounded-full transition-[width]',
                            n > 0 ? 'bg-emerald-500' : 'bg-transparent',
                          )}
                          style={{ width: `${Math.round(ratio * 100)}%` }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
