import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Landmark,
  ReceiptText,
  ScrollText,
  TicketPlus,
  Truck,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import {
  type DailyPosSalesByPaymentMethodReport,
  type DriverBalanceResponse,
  type OwnerWalletSummary,
  apiJson,
  ApiError,
  getOperatingStatus,
} from '@/lib/api';
import { useAppLocale } from '@/hooks/use-app-locale';
import { formatKwdLabel, sumKwdStrings } from '@/lib/kwd';
import { MetricCard } from '@/components/dashboard/metric-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { OrderRow } from '@/lib/api';
import { cn } from '@/lib/utils';

type DashboardPayKey =
  | 'CASH'
  | 'KNET'
  | 'ONLINE'
  | 'DEBT_ON_ACCOUNT'
  | 'SUBSCRIPTION_WALLET';

function kuwaitFinancialRangeIso(financialDateIso: string): { from: string; to: string } {
  const from = new Date(`${financialDateIso}T00:00:00+03:00`);
  const to = new Date(`${financialDateIso}T23:59:59.999+03:00`);
  return { from: from.toISOString(), to: to.toISOString() };
}

function normalizePayMethod(method: string | null): DashboardPayKey | null {
  if (!method) return null;
  if (method === 'PAYMENT_LINK' || method === 'ONLINE') return 'ONLINE';
  if (
    method === 'CASH' ||
    method === 'KNET' ||
    method === 'DEBT_ON_ACCOUNT' ||
    method === 'SUBSCRIPTION_WALLET'
  ) {
    return method;
  }
  return null;
}

/** Civil YYYY-MM-DD +/− days (Gregorian; matches Kuwait business calendar dates). */
function addDaysIso(dateIso: string, deltaDays: number): string {
  const [y, m, d] = dateIso.split('-').map((x) => Number.parseInt(x, 10));
  const u = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = u.getUTCFullYear();
  const mm = String(u.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(u.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function OrderStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const label = t(`orderStatus.${status}`, {
    defaultValue: status.replaceAll('_', ' ').toLowerCase(),
  });
  const variant =
    status === 'COMPLETED' ? 'default'
    : status === 'CANCELED' ? 'destructive'
    : 'secondary';
  return (
    <Badge variant={variant} className="font-normal">
      {label}
    </Badge>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dateLocale = useAppLocale();
  const { token, hasRole } = useAuth();
  const [drivers, setDrivers] = useState<DriverBalanceResponse | null>(null);
  const [wallet, setWallet] = useState<OwnerWalletSummary | null>(null);
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [paySplit, setPaySplit] = useState<DailyPosSalesByPaymentMethodReport | null>(null);
  const [financialDateIso, setFinancialDateIso] = useState<string | null>(null);
  const [financialDateLabel, setFinancialDateLabel] = useState<string | null>(null);
  /** `null` = use active financial day (today). */
  const [selectedBreakdownDate, setSelectedBreakdownDate] = useState<string | null>(null);
  const [paySplitLoading, setPaySplitLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const effectiveBreakdownDate = selectedBreakdownDate ?? financialDateIso;

  const loadDailyPaymentSplit = useCallback(
    async (dayIso: string, authToken: string) => {
      const { from, to } = kuwaitFinancialRangeIso(dayIso);
      const split = await apiJson<DailyPosSalesByPaymentMethodReport>(
        `/api/finance/reports/daily-pos-sales?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { token: authToken },
      );
      setPaySplit(split);
    },
    [],
  );

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const tasks: Promise<void>[] = [];

        if (
          hasRole(
            'OWNER',
            'MANAGER',
            'ACCOUNTANT',
            'SUPERVISOR',
            'VIEWER',
          )
        ) {
          tasks.push(
            apiJson<DriverBalanceResponse>('/api/finance/driver-balance', {
              token,
            }).then((d) => {
              if (!cancelled) setDrivers(d);
            }),
          );
        }
        if (hasRole('OWNER')) {
          tasks.push(
            apiJson<OwnerWalletSummary>(
              '/api/finance/owner/customer-wallet-summary',
              { token },
            ).then((w) => {
              if (!cancelled) setWallet(w);
            }),
          );
        }
        tasks.push(
          apiJson<OrderRow[]>('/api/orders', { token }).then((o) => {
            if (!cancelled) setOrders(o);
          }),
        );

        const status = await getOperatingStatus();
        if (!cancelled) {
          setFinancialDateIso(status.financialDateIso);
          setFinancialDateLabel(status.financialDateLabel);
        }

        await Promise.all(tasks);
      } catch (e) {
        if (!cancelled && e instanceof ApiError) {
          toast.error(e.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, hasRole]);

  useEffect(() => {
    if (!token || !effectiveBreakdownDate) return;
    let cancelled = false;
    void (async () => {
      setPaySplitLoading(true);
      try {
        await loadDailyPaymentSplit(effectiveBreakdownDate, token);
      } catch (e) {
        if (!cancelled && e instanceof ApiError) {
          toast.error(e.message);
        }
      } finally {
        if (!cancelled) setPaySplitLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, effectiveBreakdownDate, loadDailyPaymentSplit]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const id = window.setInterval(() => {
      void getOperatingStatus()
        .then((status) => {
          if (cancelled) return;
          if (financialDateIso && status.financialDateIso !== financialDateIso) {
            setFinancialDateIso(status.financialDateIso);
            setFinancialDateLabel(status.financialDateLabel);
            if (selectedBreakdownDate === null) {
              toast.message(`New financial day: ${status.financialDateLabel}`);
            }
            return;
          }
          setFinancialDateIso(status.financialDateIso);
          setFinancialDateLabel(status.financialDateLabel);
        })
        .catch(() => {});
    }, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [token, financialDateIso, selectedBreakdownDate]);

  const totalCashWithDrivers =
    drivers?.drivers.length ?
      sumKwdStrings(drivers.drivers.map((d) => d.heldCashTotal))
    : '0.0000';

  const feed =
    orders ?
      [...orders].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    : [];

  const ownerMetricsGrid =
    'grid gap-4 sm:grid-cols-2 xl:grid-cols-5';
  const managerMetricsGrid = 'grid gap-4 sm:grid-cols-2';

  const isOwner = hasRole('OWNER') ?? false;
  const canCreateOrder = hasRole('DRIVER', 'MANAGER', 'CALL_CENTER');
  const canOpenFinancials = hasRole(
    'OWNER',
    'MANAGER',
    'ACCOUNTANT',
    'SUPERVISOR',
    'VIEWER',
  );

  const completedRevenue = useMemo(() => {
    if (!orders?.length) return formatKwdLabel('0.0000');
    return formatKwdLabel(
      sumKwdStrings(
        orders
          .filter((o) => o.status === 'COMPLETED')
          .map((o) => o.totalPrice),
      ),
    );
  }, [orders]);

  const digitalRevenue = useMemo(() => {
    const totals = new Map<DashboardPayKey, number>();
    for (const row of paySplit?.rows ?? []) {
      const key = normalizePayMethod(row.posPaymentMethod);
      if (!key) continue;
      const v = Number.parseFloat(row.totalRevenue);
      if (!Number.isFinite(v)) continue;
      totals.set(key, (totals.get(key) ?? 0) + v);
    }
    return formatKwdLabel(((totals.get('KNET') ?? 0) + (totals.get('ONLINE') ?? 0)).toFixed(4));
  }, [paySplit]);

  const paymentBreakdownRows = useMemo(() => {
    const labels: Array<{ key: DashboardPayKey; label: string }> = [
      { key: 'CASH', label: 'Cash' },
      { key: 'KNET', label: 'K-Net' },
      { key: 'ONLINE', label: 'Online' },
      { key: 'DEBT_ON_ACCOUNT', label: 'Debt' },
      { key: 'SUBSCRIPTION_WALLET', label: 'Subscription Wallet' },
    ];
    const map = new Map<DashboardPayKey, { amount: number; count: number }>();
    for (const row of paySplit?.rows ?? []) {
      const key = normalizePayMethod(row.posPaymentMethod);
      if (!key) continue;
      const amount = Number.parseFloat(row.totalRevenue);
      const prev = map.get(key) ?? { amount: 0, count: 0 };
      map.set(key, {
        amount: prev.amount + (Number.isFinite(amount) ? amount : 0),
        count: prev.count + row.orderCount,
      });
    }
    return labels.map((x) => ({
      label: x.label,
      amount: (map.get(x.key)?.amount ?? 0).toFixed(4),
      count: map.get(x.key)?.count ?? 0,
    }));
  }, [paySplit]);

  const paymentBreakdownGrandTotal = useMemo(
    () =>
      paymentBreakdownRows.length ?
        sumKwdStrings(paymentBreakdownRows.map((r) => r.amount))
      : '0.0000',
    [paymentBreakdownRows],
  );

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t('dashboard.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('dashboard.subtitle')}</p>
        {financialDateLabel ? (
          <p className="text-xs text-muted-foreground">
            {t('dashboard.activeFinancialDate')}{' '}
            <span className="font-medium text-foreground">{financialDateLabel}</span>
          </p>
        ) : null}
      </header>

      <section
        className={cn(
          'grid gap-4',
          isOwner ? 'sm:grid-cols-2' : 'sm:grid-cols-3',
        )}
      >
        {!isOwner ?
          <button
            type="button"
            onClick={() => {
              if (canCreateOrder) {
                navigate('/orders', { state: { openCreate: true } });
              } else {
                navigate('/orders');
              }
            }}
            className="group flex flex-col gap-4 rounded-[20px] border border-border bg-card p-6 text-start shadow-sm shadow-black/[0.04] transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="rounded-xl bg-primary/10 p-3 text-primary transition-colors group-hover:bg-primary/15">
              <TicketPlus className="h-6 w-6" strokeWidth={1.75} aria-hidden />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">
                {t('dashboard.quickNewInvoice')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t('dashboard.quickNewInvoiceHint')}
              </p>
            </div>
          </button>
        : null}

        <button
          type="button"
          onClick={() => navigate('/orders')}
          className="group flex flex-col gap-4 rounded-[20px] border border-border bg-card p-6 text-start shadow-sm shadow-black/[0.04] transition-all hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="rounded-xl bg-primary/10 p-3 text-primary transition-colors group-hover:bg-primary/15">
            <ScrollText className="h-6 w-6" strokeWidth={1.75} aria-hidden />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">
              {t('dashboard.quickInvoicesData')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('dashboard.quickInvoicesDataHint')}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            canOpenFinancials ?
              navigate('/financials')
            : navigate('/orders')}
          className="group flex flex-col gap-4 rounded-[20px] border border-border bg-card p-6 text-start shadow-sm shadow-black/[0.04] transition-all hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="rounded-xl bg-primary/10 p-3 text-primary transition-colors group-hover:bg-primary/15">
            <Wallet className="h-6 w-6" strokeWidth={1.75} aria-hidden />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">
              {t('dashboard.quickTotalIncome')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {canOpenFinancials ?
                t('dashboard.quickTotalIncomeHint')
              : t('dashboard.quickTotalIncomeHintOrders')}
            </p>
            <p className="pt-2 text-xl font-bold tabular-nums text-primary">
              {loading ? '…' : completedRevenue}
            </p>
          </div>
        </button>
      </section>

      <section className="space-y-4">
        {hasRole(
          'OWNER',
          'MANAGER',
          'ACCOUNTANT',
          'SUPERVISOR',
          'VIEWER',
        ) ?
          <div
            className={
              hasRole('OWNER') ? ownerMetricsGrid : managerMetricsGrid
            }
          >
            {loading ?
              (hasRole('OWNER') ? [0, 1, 2, 3] : [0, 1]).map((i) => (
                <Skeleton key={i} className="h-32 rounded-xl" />
              ))
            : <>
                <MetricCard
                  title={t('dashboard.cashTitle')}
                  subtitle={t('dashboard.cashSubtitle')}
                  value={formatKwdLabel(totalCashWithDrivers)}
                  icon={<Truck className="h-4 w-4" />}
                  emphasis
                  footer={t('dashboard.cashFooter')}
                />
                <MetricCard
                  title={t('dashboard.digitalTitle')}
                  subtitle={t('dashboard.digitalSubtitle')}
                  value={digitalRevenue}
                  icon={<Landmark className="h-4 w-4" />}
                />
                {hasRole('OWNER') && wallet ?
                  <>
                    <MetricCard
                      title={t('dashboard.subscriptionBalancesTitle')}
                      subtitle={t('dashboard.subscriptionBalancesSubtitle')}
                      value={formatKwdLabel(
                        wallet.totalWalletLiabilities,
                      )}
                      icon={<Wallet className="h-4 w-4" />}
                    />
                    <MetricCard
                      title={t('dashboard.customerDebtTitle')}
                      subtitle={t('dashboard.customerDebtSubtitle')}
                      value={formatKwdLabel(wallet.totalCustomerDebts)}
                      icon={<ReceiptText className="h-4 w-4" />}
                    />
                    <MetricCard
                      title={t('dashboard.subscriptionUsageTitle')}
                      subtitle={t('dashboard.subscriptionUsageSubtitle')}
                      value={formatKwdLabel(wallet.totalSubscriptionUsage)}
                      icon={<Wallet className="h-4 w-4" />}
                    />
                  </>
                : hasRole('OWNER') ?
                  <>
                    <Skeleton className="h-32 rounded-xl" />
                    <Skeleton className="h-32 rounded-xl" />
                    <Skeleton className="h-32 rounded-xl" />
                  </>
                : null}
              </>
            }
          </div>
        : null}

        {hasRole('CALL_CENTER', 'DRIVER') &&
        !hasRole(
          'OWNER',
          'MANAGER',
          'ACCOUNTANT',
          'SUPERVISOR',
          'VIEWER',
        ) ?
          <Card className="rounded-[20px] border-border bg-card shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">
                {t('dashboard.workspaceTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {hasRole('CALL_CENTER') ?
                <p>{t('dashboard.workspaceCallCenter')}</p>
              : <p>{t('dashboard.workspaceDriver')}</p>}
            </CardContent>
          </Card>
        : null}
      </section>

      <section>
        <Card className="rounded-[20px] border-border bg-card shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">
              {t('dashboard.paymentBreakdownTitle')}
              {effectiveBreakdownDate ? ` (${effectiveBreakdownDate})` : ''}
            </CardTitle>
            {financialDateIso && selectedBreakdownDate && selectedBreakdownDate !== financialDateIso ?
              <p className="text-xs text-muted-foreground">
                {t('dashboard.paymentBreakdownViewingPast')}
              </p>
            : null}
          </CardHeader>
          <CardContent className="space-y-4 overflow-x-auto">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
              <div className="space-y-1">
                <label
                  htmlFor="dashboard-pay-breakdown-date"
                  className="text-xs font-medium text-muted-foreground"
                >
                  {t('dashboard.paymentBreakdownDateLabel')}
                </label>
                <input
                  id="dashboard-pay-breakdown-date"
                  type="date"
                  className="flex h-9 w-full max-w-[11rem] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={effectiveBreakdownDate ?? ''}
                  max={financialDateIso ?? undefined}
                  disabled={!financialDateIso || paySplitLoading}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v || !financialDateIso) return;
                    setSelectedBreakdownDate(v === financialDateIso ? null : v);
                  }}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!financialDateIso || paySplitLoading}
                  onClick={() => {
                    if (!financialDateIso) return;
                    setSelectedBreakdownDate(addDaysIso(financialDateIso, -1));
                  }}
                >
                  {t('dashboard.paymentBreakdownYesterday')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!financialDateIso || paySplitLoading}
                  onClick={() => setSelectedBreakdownDate(null)}
                >
                  {t('dashboard.paymentBreakdownToday')}
                </Button>
              </div>
            </div>
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-start text-muted-foreground">
                  <th className="py-2 pe-2">{t('dashboard.paymentBreakdownColType')}</th>
                  <th className="py-2 pe-2 text-end">{t('dashboard.paymentBreakdownColOrders')}</th>
                  <th className="py-2 text-end">{t('dashboard.paymentBreakdownColAmount')}</th>
                </tr>
              </thead>
              <tbody>
                {paySplitLoading ?
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-muted-foreground">
                      …
                    </td>
                  </tr>
                : paymentBreakdownRows.map((row) => (
                    <tr key={row.label} className="border-b border-border/60">
                      <td className="py-2 pe-2">{row.label}</td>
                      <td className="py-2 pe-2 text-end tabular-nums">{row.count}</td>
                      <td className="py-2 text-end tabular-nums">{formatKwdLabel(row.amount)}</td>
                    </tr>
                  ))}
                {!paySplitLoading ?
                  <tr className="border-t-2 border-border font-medium">
                    <td className="py-2 pe-2">{t('dashboard.paymentBreakdownTotal')}</td>
                    <td className="py-2 pe-2 text-end tabular-nums">
                      {paymentBreakdownRows.reduce((n, r) => n + r.count, 0)}
                    </td>
                    <td className="py-2 text-end tabular-nums">
                      {formatKwdLabel(paymentBreakdownGrandTotal)}
                    </td>
                  </tr>
                : null}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {t('dashboard.ordersTitle')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('dashboard.ordersSubtitle')}
            </p>
          </div>
        </div>
        <Card className="rounded-[20px] border-border bg-card shadow-sm">
          <CardContent className="p-0">
            {loading && !orders ?
              <div className="space-y-2 p-6">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            : <ScrollArea className="h-[min(420px,55vh)]">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[100px]">
                        {t('dashboard.colWhen')}
                      </TableHead>
                      <TableHead>{t('dashboard.colCustomer')}</TableHead>
                      <TableHead>{t('dashboard.colDriver')}</TableHead>
                      <TableHead>{t('dashboard.colStatus')}</TableHead>
                      <TableHead className="text-end">
                        {t('dashboard.colTotal')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {feed.slice(0, 12).map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(o.createdAt).toLocaleString(dateLocale, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {o.customer.phone}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {o.driver ?
                            `${o.driver.fullName} (@${o.driver.username})`
                          : <span className="text-muted-foreground/70">
                              {t('dashboard.unassigned')}
                            </span>}
                        </TableCell>
                        <TableCell>
                          <OrderStatusBadge status={o.status} />
                        </TableCell>
                        <TableCell className="text-end tabular-nums text-foreground">
                          {formatKwdLabel(o.totalPrice)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>}
            <Separator />
            {!loading && feed.length === 0 ?
              <p className="p-6 text-center text-sm text-muted-foreground">
                {t('dashboard.noOrders')}
              </p>
            : null}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}