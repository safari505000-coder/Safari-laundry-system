import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Droplets,
  TicketPlus,
  Truck,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { useSafariStream } from '@/contexts/safari-stream-context';
import {
  type BankDepositsListResponse,
  apiJson,
  ApiError,
  getBankDeposits,
  getOperatingStatus,
} from '@/lib/api';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import { formatKwdLabel } from '@/lib/kwd';
import { MetricCard } from '@/components/dashboard/metric-card';
import { ExecInteractiveDashboard } from '@/components/dashboard/exec-interactive-dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import { ScrollArea } from '@/modules/shared/components/ui/scroll-area';
import { Separator } from '@/modules/shared/components/ui/separator';
import { Skeleton } from '@/modules/shared/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';
import type { OrderRow } from '@/lib/api';
import { cn } from '@/lib/utils';
import { orderStatusChipClass } from '@/lib/safari-ui';

function OrderStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const label = t(`orderStatus.${status}`, {
    defaultValue: status.replaceAll('_', ' ').toLowerCase(),
  });
  return <span className={orderStatusChipClass(status)}>{label}</span>;
}

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dateLocale = useAppLocale();
  const { token, hasRole } = useAuth();
  const { snapshot } = useSafariStream();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [financialDateIso, setFinancialDateIso] = useState<string | null>(null);
  const [financialDateLabel, setFinancialDateLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ownerBankDeposits, setOwnerBankDeposits] =
    useState<BankDepositsListResponse | null>(null);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const tasks: Promise<void>[] = [];

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
    if (!token) return;
    let cancelled = false;
    const id = window.setInterval(() => {
      void getOperatingStatus()
        .then((status) => {
          if (cancelled) return;
          if (financialDateIso && status.financialDateIso !== financialDateIso) {
            toast.message(`New financial day: ${status.financialDateLabel}`);
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
  }, [token, financialDateIso]);

  useEffect(() => {
    if (!token || !hasRole('OWNER', 'GENERAL_MANAGER')) return;
    let cancelled = false;
    const empty: BankDepositsListResponse = {
      from: '',
      to: '',
      entries: [],
    };
    const loadDeposits = () => {
      void getBankDeposits(token, { take: 8 })
        .then((d) => {
          if (!cancelled) setOwnerBankDeposits(d);
        })
        .catch(() => {
          if (!cancelled) setOwnerBankDeposits(empty);
        });
    };
    loadDeposits();
    const interval = window.setInterval(loadDeposits, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [token, hasRole]);

  const feed =
    orders ?
      [...orders].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    : [];

  const ownerMetricsGrid =
    'grid gap-4 sm:grid-cols-2 xl:grid-cols-3';
  const managerMetricsGrid =
    'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';

  const isOwner = hasRole('OWNER', 'GENERAL_MANAGER') ?? false;
  const canCreateOrder = hasRole('DRIVER', 'MANAGER');
  /*
   * Dastur §1 — Managers exit the dashboard through /pos (their primary
   * sales tool), so the "فاتورة جديدة" quick-action card is hidden for
   * them. Only Drivers still see the shortcut on the dashboard.
   *
   * Dastur §2 (V19.3) — Call Center does NOT issue invoices under any
   * circumstance. They book subscriptions, chase debts, and operate
   * WhatsApp outreach; they do not create orders. Any invoice that
   * belongs to a customer must originate from the field (Driver) or the
   * counter (Manager / POS).
   */
  const showNewInvoiceShortcut =
    (hasRole('DRIVER') ?? false) &&
    !(hasRole('OWNER', 'GENERAL_MANAGER') ?? false);
  /** Consolidated P&L is OWNER-only (`/financials`). */
  const canOpenFinancials = hasRole('OWNER', 'GENERAL_MANAGER');

  // V19.9.7 — OWNER / GM get the interactive executive dashboard
  // (cash-flow, money movement, debts, net profit) instead of the
  // operational greeting view. Every other role keeps the original
  // dashboard below because its signals (workspace tiles, order
  // feed, pending-bag banners) are tailored to their daily job.
  if (hasRole('OWNER', 'GENERAL_MANAGER')) {
    return <ExecInteractiveDashboard />;
  }

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

      {/* Dastur §3 — Owner / Accountant alert: managers holding cash >24h. */}
      {(hasRole('OWNER', 'ACCOUNTANT') ?? false) &&
      (snapshot?.managerCustody?.fleet?.overdueCount ?? 0) > 0 ? (
        <Link
          to="/finance/manager-custody-aging"
          className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 transition-colors hover:bg-red-100"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4" aria-hidden />
          <div className="flex-1">
            <p className="font-semibold">
              {t('managerCustody.overdueBanner', {
                count: snapshot!.managerCustody!.fleet!.overdueCount,
                total: formatKwdLabel(
                  snapshot!.managerCustody!.fleet!.overdueAmountKd,
                ),
              })}
            </p>
            <p className="text-xs text-red-800/80">
              {t('managerCustody.overdueBannerHint')}
            </p>
          </div>
        </Link>
      ) : null}

      {/* Dastur §3 — Manager reminder: own pending bags. */}
      {(hasRole('MANAGER') ?? false) &&
      (snapshot?.managerCustody?.mine?.pendingCount ?? 0) > 0 ? (
        <Link
          to="/manager/custody"
          className={cn(
            'flex items-start gap-3 rounded-lg border px-4 py-3 text-sm transition-colors',
            (snapshot?.managerCustody?.mine?.overdueCount ?? 0) > 0
              ? 'border-red-300 bg-red-50 text-red-900 hover:bg-red-100'
              : 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100',
          )}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4" aria-hidden />
          <div className="flex-1">
            <p className="font-semibold">
              {t('managerCustody.myPendingBanner', {
                count: snapshot!.managerCustody!.mine!.pendingCount,
                total: formatKwdLabel(
                  snapshot!.managerCustody!.mine!.pendingAmountKd,
                ),
              })}
            </p>
            <p className="text-xs opacity-80">
              {(snapshot?.managerCustody?.mine?.overdueCount ?? 0) > 0
                ? t('managerCustody.myPendingBannerOverdue')
                : t('managerCustody.myPendingBannerHint')}
            </p>
          </div>
        </Link>
      ) : null}

      <section
        className={cn(
          'grid gap-4',
          isOwner ? 'sm:grid-cols-2' : 'sm:grid-cols-3',
        )}
      >
        {hasRole('DRIVER') && !hasRole('OWNER', 'MANAGER', 'ACCOUNTANT', 'SUPERVISOR', 'VIEWER') ?
          <button
            type="button"
            onClick={() => navigate('/my-field-expenses')}
            className="group flex flex-col gap-4 rounded-[20px] border border-border bg-card p-6 text-start shadow-sm shadow-black/[0.04] transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="rounded-xl bg-primary/10 p-3 text-primary transition-colors group-hover:bg-primary/15">
              <Droplets className="h-6 w-6" strokeWidth={1.75} aria-hidden />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">
                {t('dashboard.quickAddExpense')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t('dashboard.quickAddExpenseHint')}
              </p>
            </div>
          </button>
        : null}

        {showNewInvoiceShortcut ?
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

        {/*
         * Dastur §2.2 — "بيانات الفواتير" now lives in the sidebar
         * (see `invoicesDataItem`). The dashboard quick-action card is
         * removed to avoid duplicating the navigation entry.
         */}

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
              {canOpenFinancials ?
                t('dashboard.quickTotalIncome')
              : t('dashboard.quickOrders')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {canOpenFinancials ?
                t('dashboard.quickTotalIncomeHint')
              : t('dashboard.quickTotalIncomeHintOrders')}
            </p>
          </div>
        </button>
      </section>

      <section className="space-y-4">
        {hasRole('OWNER', 'ACCOUNTANT') ?
          <div
            className={
              hasRole('OWNER', 'GENERAL_MANAGER') ? ownerMetricsGrid : managerMetricsGrid
            }
          >
            {loading ?
              [0, 1].map((i) => (
                <Skeleton key={i} className="h-32 rounded-xl" />
              ))
            : hasRole('ACCOUNTANT') && !hasRole('OWNER', 'GENERAL_MANAGER') ?
              snapshot?.institution ?
                <>
                  <MetricCard
                    title={t('dashboard.instFieldCash')}
                    subtitle={t('dashboard.instFieldCashSubtitle')}
                    value={formatKwdLabel(
                      snapshot.institution.allDriversFieldCashKd,
                    )}
                    icon={<Truck className="h-4 w-4" />}
                    emphasis
                  />
                  <MetricCard
                    title={t('dashboard.instPendingDeposits')}
                    subtitle={t('dashboard.instPendingDepositsSubtitle')}
                    value={formatKwdLabel(
                      snapshot.managerCustody?.fleet?.pendingAmountKd ??
                        snapshot.institution.allDriversPendingDepositsKd,
                    )}
                    icon={<Wallet className="h-4 w-4" />}
                  />
                </>
              : [0, 1].map((i) => (
                  <Skeleton key={`acct-${i}`} className="h-32 rounded-xl" />
                ))
            : hasRole('OWNER', 'GENERAL_MANAGER') && snapshot?.institution ?
              <>
                <MetricCard
                  title={t('dashboard.instFieldCash')}
                  subtitle={t('dashboard.instFieldCashSubtitle')}
                  value={formatKwdLabel(
                    snapshot.institution.allDriversFieldCashKd,
                  )}
                  icon={<Truck className="h-4 w-4" />}
                  emphasis
                />
                <MetricCard
                  title={t('dashboard.instPendingDeposits')}
                  subtitle={t('dashboard.instPendingDepositsSubtitle')}
                  value={formatKwdLabel(
                    snapshot.managerCustody?.fleet?.pendingAmountKd ??
                      snapshot.institution.allDriversPendingDepositsKd,
                  )}
                  icon={<Wallet className="h-4 w-4" />}
                />
              </>
            : hasRole('OWNER', 'GENERAL_MANAGER') ?
              [0, 1].map((i) => (
                <Skeleton key={`own-${i}`} className="h-32 rounded-xl" />
              ))
            : null}
          </div>
        : null}

        {hasRole('CALL_CENTER', 'CALL_CENTER_SUPERVISOR', 'DRIVER') &&
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
              {hasRole('CALL_CENTER', 'CALL_CENTER_SUPERVISOR') ?
                <p>{t('dashboard.workspaceCallCenter')}</p>
              : <p>{t('dashboard.workspaceDriver')}</p>}
            </CardContent>
          </Card>
        : null}
      </section>

      {hasRole('OWNER', 'GENERAL_MANAGER') && ownerBankDeposits ?
        <section>
          <Card className="rounded-[20px] border-border bg-card shadow-sm">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">
                {t('dashboard.bankDepositsLogTitle')}
              </CardTitle>
              <Link
                to="/bank-deposits"
                className="text-sm font-medium text-primary hover:underline"
              >
                {t('dashboard.bankDepositsViewAll')}
              </Link>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0 sm:p-6 pt-0">
              {ownerBankDeposits.entries.length === 0 ?
                <p className="px-6 pb-6 text-sm text-muted-foreground sm:px-0">
                  {t('dashboard.bankDepositsEmpty')}
                </p>
              : <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">
                        {t('dashboard.bankDepositsColDate')}
                      </TableHead>
                      <TableHead className="text-end">
                        {t('dashboard.bankDepositsColAmount')}
                      </TableHead>
                      <TableHead>{t('dashboard.bankDepositsColType')}</TableHead>
                      <TableHead>{t('dashboard.bankDepositsColReceipt')}</TableHead>
                      <TableHead>{t('dashboard.bankDepositsColVerified')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ownerBankDeposits.entries.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(row.createdAt).toLocaleString(dateLocale, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </TableCell>
                        <TableCell className="text-end tabular-nums text-sm">
                          {formatKwdLabel(row.amountKd)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.depositType === 'CASH_DEPOSIT_SLIP' ?
                            t('bankDeposits.typeCashSlip')
                          : t('bankDeposits.typeKnetZ')}
                        </TableCell>
                        <TableCell>
                          <a
                            href={row.receiptImageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            {t('bankDeposits.openReceipt')}
                          </a>
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.verifiedByAccountant ?
                            <span className="text-emerald-700 dark:text-emerald-400">
                              {t('bankDeposits.yes')} — {row.verifiedByAccountant.fullName}
                            </span>
                          : <span className="text-muted-foreground">{t('bankDeposits.no')}</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>}
            </CardContent>
          </Card>
        </section>
      : null}

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
                        <TableCell className="safari-table-primary">
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
