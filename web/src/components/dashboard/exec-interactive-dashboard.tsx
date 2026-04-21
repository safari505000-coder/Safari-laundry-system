import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CreditCard,
  Loader2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Truck,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useSafariStream } from '@/contexts/safari-stream-context';
import {
  type DailyPosSalesByPaymentMethodReport,
  type DebtByCategoryReport,
  type DriverBalanceResponse,
  type ExecutiveSummaryReport,
  type OwnerWalletSummary,
  apiJson,
  ApiError,
  EMPTY_EXECUTIVE_SUMMARY_REPORT,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/modules/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import { Skeleton } from '@/modules/shared/components/ui/skeleton';
import { PageHeader } from '@/modules/shared/components/page';
import { toast } from 'sonner';

/**
 * V19.9.7 — Interactive executive dashboard (OWNER / GM).
 *
 * Replaces the operational greeting dashboard with a live, clickable
 * control tower of Safari's money: gross revenue, net profit, total
 * expenses, and total customer debt — plus three horizontal charts
 * (cash-flow waterfall, payment-method split, debt breakdown) and a
 * field-cash drill-down per driver.
 *
 * All visuals are rendered with plain Tailwind bars (no chart library)
 * so the dashboard adds zero bundle weight and remains accessible.
 * Bars are clickable and navigate to the matching slice of the
 * financial reports hub, so the dashboard becomes a true cockpit
 * rather than a static card wall.
 */

type RangeKey = 'today' | 'week' | '30d' | 'month';

function startOfDayIso(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}
function endOfDayIso(d: Date): string {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
}
function computeRange(range: RangeKey): { from: string; to: string } {
  const now = new Date();
  const to = endOfDayIso(now);
  if (range === 'today') return { from: startOfDayIso(now), to };
  if (range === 'week') {
    const f = new Date(now);
    f.setDate(f.getDate() - 6);
    return { from: startOfDayIso(f), to };
  }
  if (range === '30d') {
    const f = new Date(now);
    f.setDate(f.getDate() - 29);
    return { from: startOfDayIso(f), to };
  }
  const f = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: startOfDayIso(f), to };
}

function num(s: string | null | undefined): number {
  if (!s) return 0;
  const v = Number.parseFloat(s);
  return Number.isFinite(v) ? v : 0;
}

export function ExecInteractiveDashboard() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { snapshot } = useSafariStream();
  const [range, setRange] = useState<RangeKey>('today');
  const [{ from, to }, setWindow] = useState(() => computeRange('today'));
  const [exec, setExec] = useState<ExecutiveSummaryReport>(
    EMPTY_EXECUTIVE_SUMMARY_REPORT,
  );
  const [paySplit, setPaySplit] =
    useState<DailyPosSalesByPaymentMethodReport | null>(null);
  const [wallet, setWallet] = useState<OwnerWalletSummary | null>(null);
  const [debts, setDebts] = useState<DebtByCategoryReport | null>(null);
  const [drivers, setDrivers] = useState<DriverBalanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setWindow(computeRange(range));
  }, [range]);

  const fetchAll = useCallback(async () => {
    if (!token) return;
    const first = loading;
    if (!first) setRefreshing(true);
    try {
      const qs = new URLSearchParams({ from, to }).toString();
      const [execRes, split, w, debt, drv] = await Promise.all([
        apiJson<ExecutiveSummaryReport>(
          `/api/reports/executive-summary?${qs}`,
          { token },
        ).catch(() => EMPTY_EXECUTIVE_SUMMARY_REPORT),
        apiJson<DailyPosSalesByPaymentMethodReport>(
          `/api/finance/reports/daily-pos-sales?${qs}`,
          { token },
        ).catch(() => null),
        apiJson<OwnerWalletSummary>(
          '/api/finance/owner/customer-wallet-summary',
          { token },
        ).catch(() => null),
        apiJson<DebtByCategoryReport>(
          `/api/finance/reports/debt-by-category?${qs}`,
          { token },
        ).catch(() => null),
        apiJson<DriverBalanceResponse>('/api/finance/driver-balance', {
          token,
        }).catch(() => null),
      ]);
      setExec({ ...EMPTY_EXECUTIVE_SUMMARY_REPORT, ...execRes });
      setPaySplit(split);
      setWallet(w);
      setDebts(debt);
      setDrivers(drv);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, from, to, loading]);

  useEffect(() => {
    void fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, token]);

  const grossKd = num(exec.grossRevenueKd);
  const netKd = num(exec.netProfitKd);
  const expensesKd =
    num(exec.variableSoapFuelKd) +
    num(exec.miscOperationalKd) +
    num(exec.fixedExpensesKd) +
    num(exec.payrollPaidKd);
  const totalDebtsKd = num(wallet?.totalCustomerDebts);

  const netIsPositive = netKd >= 0;
  const netMargin = grossKd > 0 ? (netKd / grossKd) * 100 : 0;

  const flowSegments = useMemo(() => {
    const total = Math.max(grossKd, 0.01);
    const pct = (v: number) => Math.max(0, (v / total) * 100);
    return [
      {
        id: 'bank',
        labelKey: 'dashboard.flowBankFees',
        amount: num(exec.bankFeesTotalKd),
        tone: 'bg-amber-500/80',
      },
      {
        id: 'variable',
        labelKey: 'dashboard.flowVariable',
        amount:
          num(exec.variableSoapFuelKd) + num(exec.miscOperationalKd),
        tone: 'bg-orange-500/80',
      },
      {
        id: 'fixed',
        labelKey: 'dashboard.flowFixed',
        amount: num(exec.fixedExpensesKd),
        tone: 'bg-rose-500/80',
      },
      {
        id: 'payroll',
        labelKey: 'dashboard.flowPayroll',
        amount: num(exec.payrollPaidKd),
        tone: 'bg-violet-500/80',
      },
      {
        id: 'net',
        labelKey: 'dashboard.flowNet',
        amount: Math.max(netKd, 0),
        tone: netKd >= 0 ? 'bg-emerald-500/80' : 'bg-destructive/80',
      },
    ].map((s) => ({ ...s, pct: pct(s.amount) }));
  }, [exec, grossKd, netKd]);

  const movementRows = useMemo(() => {
    const rows = paySplit?.rows ?? [];
    const total =
      rows.reduce((a, r) => a + num(r.totalRevenue), 0) || 0.01;
    const sorted = [...rows].sort(
      (a, b) => num(b.totalRevenue) - num(a.totalRevenue),
    );
    return sorted.map((r) => ({
      method: r.posPaymentMethod,
      amount: num(r.totalRevenue),
      count: r.orderCount,
      pct: (num(r.totalRevenue) / total) * 100,
    }));
  }, [paySplit]);

  const debtRows = useMemo(() => {
    if (!debts) return [];
    const agg: Record<string, number> = {};
    for (const r of debts.rows) {
      agg[r.category] = (agg[r.category] ?? 0) + num(r.totalDebt);
    }
    const total = Object.values(agg).reduce((a, b) => a + b, 0) || 0.01;
    // V19.10 — only BRANCH and DRIVER issue invoices, so they are the
    // only entities that can accumulate customer debt worth tracking
    // here. OWNER / CALL_CENTER buckets always sum to zero in practice
    // and were only adding visual noise to the breakdown.
    return (['BRANCH', 'DRIVER'] as const).map((cat) => ({
      category: cat,
      amount: agg[cat] ?? 0,
      pct: ((agg[cat] ?? 0) / total) * 100,
    }));
  }, [debts]);

  const fieldCashRows = useMemo(() => {
    if (!drivers) return [];
    return [...drivers.drivers]
      .filter((d) => num(d.pendingCashKd) > 0)
      .sort((a, b) => num(b.pendingCashKd) - num(a.pendingCashKd))
      .slice(0, 6);
  }, [drivers]);

  const headerActions = (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => void fetchAll()}
        disabled={refreshing}
        className="gap-1.5"
      >
        {refreshing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">{t('dashboard.refresh')}</span>
      </Button>
      <Link
        to="/reports-hub"
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
      >
        {t('dashboard.openReports')}
      </Link>
      <Link
        to="/financials"
        className={cn(buttonVariants({ size: 'sm' }))}
      >
        {t('dashboard.openPnl')}
      </Link>
    </>
  );

  const ranges: { id: RangeKey; labelKey: string }[] = [
    { id: 'today', labelKey: 'dashboard.rangeToday' },
    { id: 'week', labelKey: 'dashboard.rangeWeek' },
    { id: '30d', labelKey: 'dashboard.range30' },
    { id: 'month', labelKey: 'dashboard.rangeMonth' },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('dashboard.execTitle')}
        subtitle={t('dashboard.execSubtitle')}
        tone="blue"
        actions={headerActions}
      />

      <div className="flex flex-wrap gap-1.5">
        {ranges.map((r) => {
          const active = range === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-xs font-medium transition',
                active
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              {t(r.labelKey)}
            </button>
          );
        })}
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <HeroKpi
          tone="blue"
          icon={<Banknote className="h-5 w-5" />}
          label={t('dashboard.kpiGross')}
          hint={t('dashboard.kpiGrossHint')}
          value={formatKwdLabel(grossKd.toFixed(3))}
          loading={loading}
        />
        <HeroKpi
          tone={netIsPositive ? 'green' : 'red'}
          icon={
            netIsPositive ? (
              <TrendingUp className="h-5 w-5" />
            ) : (
              <TrendingDown className="h-5 w-5" />
            )
          }
          label={t('dashboard.kpiNet')}
          hint={
            grossKd > 0
              ? `${netMargin.toFixed(1)}% ${t('dashboard.kpiNetHint')}`
              : t('dashboard.kpiNetHint')
          }
          value={formatKwdLabel(netKd.toFixed(3))}
          valueTone={netIsPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}
          loading={loading}
        />
        <HeroKpi
          tone="orange"
          icon={<ArrowDownRight className="h-5 w-5" />}
          label={t('dashboard.kpiExpenses')}
          hint={t('dashboard.kpiExpensesHint')}
          value={formatKwdLabel(expensesKd.toFixed(3))}
          loading={loading}
        />
        <HeroKpi
          tone="red"
          icon={<ArrowUpRight className="h-5 w-5" />}
          label={t('dashboard.kpiDebts')}
          hint={t('dashboard.kpiDebtsHint')}
          value={formatKwdLabel(totalDebtsKd.toFixed(3))}
          loading={loading}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title={t('dashboard.flowTitle')}
          subtitle={t('dashboard.flowSubtitle')}
        >
          {loading ? (
            <SkeletonBars count={5} />
          ) : grossKd <= 0 ? (
            <EmptyLine text={t('dashboard.noData')} />
          ) : (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted-foreground">
                  {t('dashboard.flowGross')}
                </span>
                <span className="tabular-nums text-sm font-semibold">
                  {formatKwdLabel(grossKd.toFixed(3))}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full w-full bg-sky-500/70" />
              </div>
              <div className="space-y-2 pt-1">
                {flowSegments.map((s) => (
                  <FlowRow
                    key={s.id}
                    label={t(s.labelKey)}
                    amount={formatKwdLabel(s.amount.toFixed(3))}
                    pct={s.pct}
                    barClass={s.tone}
                  />
                ))}
              </div>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title={t('dashboard.movementTitle')}
          subtitle={t('dashboard.movementSubtitle')}
        >
          {loading ? (
            <SkeletonBars count={5} />
          ) : movementRows.length === 0 ? (
            <EmptyLine text={t('dashboard.noData')} />
          ) : (
            <div className="space-y-3">
              {movementRows.map((r) => (
                <BarRow
                  key={r.method}
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      {r.method === 'KNET' ? (
                        <CreditCard className="h-3.5 w-3.5 text-sky-600" />
                      ) : r.method === 'CASH' ? (
                        <Banknote className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Wallet className="h-3.5 w-3.5 text-violet-600" />
                      )}
                      <span>{r.method}</span>
                    </span>
                  }
                  amount={`${formatKwdLabel(r.amount.toFixed(3))} · ${r.count}`}
                  pct={r.pct}
                  barClass={
                    r.method === 'KNET'
                      ? 'bg-sky-500/80'
                      : r.method === 'CASH'
                        ? 'bg-emerald-500/80'
                        : r.method === 'PAYMENT_LINK'
                          ? 'bg-orange-500/80'
                          : r.method === 'SUBSCRIPTION_WALLET'
                            ? 'bg-violet-500/80'
                            : 'bg-muted-foreground/40'
                  }
                  to={`/reports?tab=invoices`}
                />
              ))}
            </div>
          )}
        </ChartCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <ChartCard
          className="lg:col-span-3"
          title={t('dashboard.debtsTitle')}
          subtitle={t('dashboard.debtsSubtitle')}
        >
          {loading ? (
            <SkeletonBars count={4} />
          ) : debtRows.every((r) => r.amount === 0) ? (
            <EmptyLine text={t('dashboard.noData')} />
          ) : (
            <div className="space-y-3">
              {debtRows.map((r) => (
                <BarRow
                  key={r.category}
                  label={t(
                    r.category === 'BRANCH'
                      ? 'dashboard.debtsBranch'
                      : 'dashboard.debtsDriver',
                  )}
                  amount={formatKwdLabel(r.amount.toFixed(3))}
                  pct={r.pct}
                  barClass={
                    r.category === 'BRANCH'
                      ? 'bg-sky-500/80'
                      : 'bg-orange-500/80'
                  }
                  to="/financials"
                />
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard
          className="lg:col-span-2"
          title={t('dashboard.fieldCashTitle')}
          subtitle={t('dashboard.fieldCashSubtitle')}
          trailing={
            snapshot?.institution ? (
              <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                {formatKwdLabel(
                  snapshot.institution.allDriversFieldCashKd,
                )}
              </span>
            ) : null
          }
        >
          {loading ? (
            <SkeletonBars count={4} />
          ) : fieldCashRows.length === 0 ? (
            <EmptyLine text={t('dashboard.noData')} />
          ) : (
            <ul className="space-y-2">
              {fieldCashRows.map((d) => (
                <li
                  key={d.driverId}
                  className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm"
                >
                  <span className="inline-flex items-center gap-2">
                    <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium text-foreground">
                      {d.fullName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      @{d.username}
                    </span>
                  </span>
                  <span className="tabular-nums font-semibold">
                    {formatKwdLabel(d.pendingCashKd)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </section>
    </div>
  );
}

function HeroKpi({
  tone,
  icon,
  label,
  hint,
  value,
  valueTone,
  loading,
}: {
  tone: 'blue' | 'green' | 'orange' | 'red' | 'purple';
  icon: React.ReactNode;
  label: string;
  hint: string;
  value: React.ReactNode;
  valueTone?: string;
  loading?: boolean;
}) {
  const toneBg: Record<string, string> = {
    blue: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    orange: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    red: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    purple: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  };
  return (
    <Card className="relative overflow-hidden px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">
            {label}
          </p>
          <p
            className={cn(
              'mt-1 text-2xl font-bold tabular-nums text-foreground',
              valueTone,
            )}
          >
            {loading ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              value
            )}
          </p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground/90">
            {hint}
          </p>
        </div>
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            toneBg[tone],
          )}
        >
          {icon}
        </div>
      </div>
    </Card>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className,
  trailing,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
        <div className="min-w-0">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {trailing}
      </CardHeader>
      <CardContent className="pt-1">{children}</CardContent>
    </Card>
  );
}

function BarRow({
  label,
  amount,
  pct,
  barClass,
  to,
}: {
  label: React.ReactNode;
  amount: string;
  pct: number;
  barClass: string;
  to?: string;
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  const content = (
    <>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-foreground/90">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {amount} · {clamped.toFixed(0)}%
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', barClass)}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </>
  );
  if (to) {
    return (
      <Link
        to={to}
        className="block rounded-lg p-1.5 -m-1.5 transition hover:bg-muted/50"
      >
        {content}
      </Link>
    );
  }
  return <div>{content}</div>;
}

function FlowRow({
  label,
  amount,
  pct,
  barClass,
}: {
  label: string;
  amount: string;
  pct: number;
  barClass: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums text-foreground/90">
          {amount} · {pct.toFixed(0)}%
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', barClass)}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}

function SkeletonBars({ count }: { count: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2 w-full" />
        </div>
      ))}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>
  );
}
