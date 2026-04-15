import { useEffect, useMemo, useState } from 'react';
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
  type DriverBalanceResponse,
  type OwnerWalletSummary,
  apiJson,
  ApiError,
} from '@/lib/api';
import { useAppLocale } from '@/hooks/use-app-locale';
import { formatKwdLabel, sumKwdStrings } from '@/lib/kwd';
import { MetricCard } from '@/components/dashboard/metric-card';
import { Badge } from '@/components/ui/badge';
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
  const [loading, setLoading] = useState(true);

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
    'grid gap-4 sm:grid-cols-2 xl:grid-cols-4';
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

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t('dashboard.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('dashboard.subtitle')}</p>
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
                  value={formatKwdLabel('0.0000')}
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
                  </>
                : hasRole('OWNER') ?
                  <>
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
