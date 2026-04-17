import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Banknote,
  FileDown,
  Loader2,
  Printer,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  type DailyCashClosingReport,
  type DriverBalanceResponse,
  type DriverLedgerReport,
  type ExecutiveSummaryReport,
  type IssuedInvoicesReport,
  apiJson,
  ApiError,
} from '@/lib/api';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import { formatKwdLabel } from '@/lib/kwd';
import { Button } from '@/modules/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/shared/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/modules/shared/components/ui/tabs';
import { LiveOperationsFeed } from '@/components/reports/live-operations-feed';
import { EXECUTIVE_SUMMARY_REFRESH_EVENT } from '@/lib/executive-summary-refresh';
import { cn } from '@/lib/utils';

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

export function ReportsPage() {
  const { t } = useTranslation();
  const dateLocale = useAppLocale();
  const { token, hasRole, ownerBranchId } = useAuth();
  const [from, setFrom] = useState(() => startOfDayIso(new Date()));
  const [to, setTo] = useState(() => endOfDayIso(new Date()));
  const [payFilter, setPayFilter] = useState<string>('ALL');
  const [driverFilter, setDriverFilter] = useState<string>('ALL');
  const [drivers, setDrivers] = useState<DriverBalanceResponse | null>(null);
  const [ledgerDriverId, setLedgerDriverId] = useState<string>('');

  const [invoices, setInvoices] = useState<IssuedInvoicesReport | null>(null);
  const [ledger, setLedger] = useState<DriverLedgerReport | null>(null);
  const [closing, setClosing] = useState<DailyCashClosingReport | null>(null);
  const [executive, setExecutive] = useState<ExecutiveSummaryReport | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const canView =
    hasRole(
      'OWNER',
      'MANAGER',
      'ACCOUNTANT',
      'SUPERVISOR',
      'VIEWER',
    ) ?? false;

  const isOwner = hasRole('OWNER') ?? false;
  /** Only OWNER can see payroll + net profit cards. */
  const hideOwnerOnlyExecCards = !isOwner;

  useEffect(() => {
    if (!token || !canView) return;
    let c = false;
    void apiJson<DriverBalanceResponse>('/api/finance/driver-balance', {
      token,
    })
      .then((d) => {
        if (!c) {
          setDrivers(d);
          setLedgerDriverId((prev) => {
            if (prev) return prev;
            return d.drivers[0]?.driverId ?? '';
          });
        }
      })
      .catch(() => {});
    return () => {
      c = true;
    };
  }, [token, canView]);

  const branchQs = useMemo(() => {
    const o: Record<string, string> = {};
    if (ownerBranchId) o.branchId = ownerBranchId;
    return o;
  }, [ownerBranchId]);

  const driverOptions = useMemo(() => {
    const list = drivers?.drivers ?? [];
    if (!ownerBranchId) return list;
    return list.filter((d) => d.branchId === ownerBranchId);
  }, [drivers, ownerBranchId]);

  useEffect(() => {
    setLedgerDriverId((prev) => {
      if (driverOptions.some((d) => d.driverId === prev)) return prev;
      return driverOptions[0]?.driverId ?? '';
    });
    setDriverFilter((prev) => {
      if (prev === 'ALL') return prev;
      if (driverOptions.some((d) => d.driverId === prev)) return prev;
      return 'ALL';
    });
  }, [driverOptions]);

  const queryExecutive = useCallback(async () => {
    if (!token || !canView) return;
    try {
      const qs = new URLSearchParams({ from, to, ...branchQs });
      const data = await apiJson<ExecutiveSummaryReport>(
        `/api/reports/executive-summary?${qs.toString()}`,
        { token },
      );
      setExecutive(data);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    }
  }, [token, from, to, branchQs, canView]);

  useEffect(() => {
    void queryExecutive();
  }, [queryExecutive]);

  useEffect(() => {
    const handler = () => {
      void queryExecutive();
    };
    window.addEventListener(EXECUTIVE_SUMMARY_REFRESH_EVENT, handler);
    return () =>
      window.removeEventListener(EXECUTIVE_SUMMARY_REFRESH_EVENT, handler);
  }, [queryExecutive]);

  const queryInvoices = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    try {
      const qs = new URLSearchParams({
        from,
        to,
        ...branchQs,
        ...(driverFilter !== 'ALL' ? { driverId: driverFilter } : {}),
        ...(payFilter !== 'ALL' ? { posPaymentMethod: payFilter } : {}),
      });
      const data = await apiJson<IssuedInvoicesReport>(
        `/api/reports/issued-invoices?${qs.toString()}`,
        { token },
      );
      setInvoices(data);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }, [token, from, to, driverFilter, payFilter, branchQs]);

  const queryLedger = useCallback(async () => {
    if (!token || !ledgerDriverId) return;
    setBusy(true);
    try {
      const qs = new URLSearchParams({
        driverId: ledgerDriverId,
        from,
        to,
        ...branchQs,
      });
      const data = await apiJson<DriverLedgerReport>(
        `/api/reports/driver-ledger?${qs.toString()}`,
        { token },
      );
      setLedger(data);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }, [token, from, to, ledgerDriverId, branchQs]);

  const queryClosing = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    try {
      const qs = new URLSearchParams({ from, to, ...branchQs });
      const data = await apiJson<DailyCashClosingReport>(
        `/api/reports/daily-cash-closing?${qs.toString()}`,
        { token },
      );
      setClosing(data);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }, [token, from, to, branchQs]);

  if (!canView) {
    return <Navigate to="/" replace />;
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-6 xl:flex-row xl:items-start',
        isOwner ? 'xl:gap-8' : 'xl:gap-6',
      )}
    >
      <div className="min-w-0 flex-1 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('reports.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('reports.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" />
            {t('reports.printPdf')}
          </Button>
        </div>
      </div>

      {executive ?
        <div className="space-y-3">
          <div
            className={cn(
              'grid gap-3 sm:grid-cols-2 print:grid-cols-2',
              hideOwnerOnlyExecCards ? '' : 'xl:grid-cols-4',
            )}
          >
            <Card
              className={cn(
                'overflow-hidden border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-teal-50/90 shadow-sm',
                'dark:border-emerald-900/50 dark:from-emerald-950/50 dark:to-emerald-950/20',
              )}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                  <TrendingUp className="h-4 w-4 shrink-0" aria-hidden />
                  {t('reports.execGross')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums text-emerald-950 dark:text-emerald-50">
                  {formatKwdLabel(executive.grossRevenueKd)}
                </p>
                <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-200/80">
                  {t('reports.execGrossHint')}
                </p>
              </CardContent>
            </Card>
            <Card
              className={cn(
                'overflow-hidden border-rose-200/80 bg-gradient-to-br from-rose-50 to-red-50/90 shadow-sm',
                'dark:border-rose-900/50 dark:from-rose-950/50 dark:to-rose-950/20',
              )}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-rose-900 dark:text-rose-100">
                  <TrendingDown className="h-4 w-4 shrink-0" aria-hidden />
                  {t('reports.execExpenses')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums text-rose-950 dark:text-rose-50">
                  {formatKwdLabel(executive.totalExpensesVariableAndFixedKd)}
                </p>
                <p className="mt-1 text-xs text-rose-800/80 dark:text-rose-200/80">
                  {t('reports.execExpensesHint')}
                </p>
              </CardContent>
            </Card>
            {!hideOwnerOnlyExecCards ?
              <>
                <Card
                  className={cn(
                    'overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 to-blue-50/90 shadow-sm',
                    'dark:border-sky-900/50 dark:from-sky-950/50 dark:to-sky-950/20',
                  )}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold text-sky-900 dark:text-sky-100">
                      <Users className="h-4 w-4 shrink-0" aria-hidden />
                      {t('reports.execPayroll')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold tabular-nums text-sky-950 dark:text-sky-50">
                      {formatKwdLabel(executive.payrollPaidKd)}
                    </p>
                    <p className="mt-1 text-xs text-sky-800/80 dark:text-sky-200/80">
                      {t('reports.execPayrollHint')}
                    </p>
                  </CardContent>
                </Card>
                <Card
                  className={cn(
                    'overflow-hidden border-amber-300/90 bg-gradient-to-br from-amber-50 via-yellow-50 to-amber-100/90 shadow-md ring-1 ring-amber-200/60',
                    'dark:border-amber-800/60 dark:from-amber-950/60 dark:via-yellow-950/40 dark:to-amber-950/30',
                  )}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold text-amber-950 dark:text-amber-100">
                      <Banknote className="h-4 w-4 shrink-0" aria-hidden />
                      {t('reports.execNet')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p
                      className={cn(
                        'text-2xl font-bold tabular-nums',
                        Number.parseFloat(executive.netProfitKd) < 0 ?
                          'text-destructive'
                        : 'text-amber-950 dark:text-amber-50',
                      )}
                    >
                      {formatKwdLabel(executive.netProfitKd)}
                    </p>
                    <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-200/80">
                      {t('reports.execNetHint')}
                    </p>
                  </CardContent>
                </Card>
              </>
            : null}
          </div>
          <Card>
            <CardContent className="pt-6">
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <dt className="font-medium">ط¥ط¬ظ…ط§ظ„ظٹ ط¯ط¹ظ… ط§ظ„ط§ط´طھط±ط§ظƒط§طھ</dt>
                  <dd className="tabular-nums font-semibold">
                    {formatKwdLabel(executive.subscriptionSubsidyKd)}
                  </dd>
                </div>
                <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <dt className="font-medium">
                    ط¥ط¬ظ…ط§ظ„ظٹ ط¯ط¹ظ… ط§ظ„ط§ط´طھط±ط§ظƒط§طھ (ط§ظ„ظ…ظƒطھط¨ ط§ظ„ط±ط¦ظٹط³ظٹ - ظƒظ„ ط§ظ„ظپط±ظˆط¹)
                  </dt>
                  <dd className="tabular-nums font-semibold">
                    {formatKwdLabel(executive.enterpriseSubscriptionSubsidyKd)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      : null}

      <Card className="print:shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('reports.filters')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="rep-from">{t('reports.from')}</Label>
            <Input
              id="rep-from"
              type="datetime-local"
              value={from.slice(0, 16)}
              onChange={(e) =>
                setFrom(new Date(e.target.value).toISOString())
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rep-to">{t('reports.to')}</Label>
            <Input
              id="rep-to"
              type="datetime-local"
              value={to.slice(0, 16)}
              onChange={(e) =>
                setTo(new Date(e.target.value).toISOString())
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('reports.paymentMethod')}</Label>
            <Select
              value={payFilter}
              onValueChange={(v) => setPayFilter(v ?? 'ALL')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('reports.all')}</SelectItem>
                <SelectItem value="SUBSCRIPTION_WALLET">
                  SUBSCRIPTION_WALLET
                </SelectItem>
                <SelectItem value="CASH">CASH</SelectItem>
                <SelectItem value="KNET">KNET</SelectItem>
                <SelectItem value="PAYMENT_LINK">ONLINE</SelectItem>
                <SelectItem value="DEBT_ON_ACCOUNT">DEBT_ON_ACCOUNT</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('reports.driver')}</Label>
            <Select
              value={driverFilter}
              onValueChange={(v) => setDriverFilter(v ?? 'ALL')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('reports.all')}</SelectItem>
                {driverOptions.map((d) => (
                  <SelectItem key={d.driverId} value={d.driverId}>
                    {d.fullName} ({d.username})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="invoices" className="space-y-4">
        <TabsList className="grid w-full max-w-xl grid-cols-3 print:hidden">
          <TabsTrigger value="invoices">{t('reports.tabInvoices')}</TabsTrigger>
          <TabsTrigger value="ledger">{t('reports.tabLedger')}</TabsTrigger>
          <TabsTrigger value="closing">{t('reports.tabClosing')}</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="space-y-3">
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void queryInvoices()}
              className="gap-1.5"
            >
              {busy ?
                <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />}
              {t('reports.run')}
            </Button>
          </div>
          <Card id="reports-print-invoices">
            <CardHeader>
              <CardTitle className="text-base">
                {t('reports.issuedInvoices')}
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {invoices ?
                <>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {invoices.count} {t('reports.rows')} آ·{' '}
                    {new Date(invoices.from).toLocaleString(dateLocale)} â€”{' '}
                    {new Date(invoices.to).toLocaleString(dateLocale)}
                  </p>
                  <table className="w-full min-w-[640px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b text-start text-muted-foreground">
                        <th className="py-2 pe-2">{t('reports.colCreated')}</th>
                        <th className="py-2 pe-2">{t('reports.colInvoice')}</th>
                        <th className="py-2 pe-2">{t('reports.colCustomer')}</th>
                        <th className="py-2 pe-2">{t('reports.colDriver')}</th>
                        <th className="py-2 pe-2">{t('reports.colPay')}</th>
                        <th className="py-2 pe-2">{t('reports.colStatus')}</th>
                        <th className="py-2 text-end">{t('reports.colTotal')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.rows.map((r) => (
                        <tr key={r.id} className="border-b border-border/60">
                          <td className="py-2 pe-2 whitespace-nowrap">
                            {new Date(r.createdAt).toLocaleString(dateLocale)}
                          </td>
                          <td className="py-2 pe-2 font-mono text-xs">
                            {r.invoiceNumber ?? r.id.slice(0, 8)}
                          </td>
                          <td className="py-2 pe-2">
                            {r.customer.displayName ?? r.customer.phone}
                          </td>
                          <td className="py-2 pe-2">
                            {r.driver?.fullName ?? 'â€”'}
                          </td>
                          <td className="py-2 pe-2">
                            {r.posPaymentMethod ?? 'â€”'}
                          </td>
                          <td className="py-2 pe-2">{r.status}</td>
                          <td className="py-2 text-end tabular-nums">
                            {formatKwdLabel(r.totalPrice)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              : <p className="text-sm text-muted-foreground">{t('reports.runHint')}</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ledger" className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end print:hidden">
            <div className="space-y-1.5 sm:min-w-[220px]">
              <Label>{t('reports.ledgerDriver')}</Label>
              <Select
                value={ledgerDriverId}
                onValueChange={(v) => setLedgerDriverId(v ?? '')}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('reports.pickDriver')} />
                </SelectTrigger>
                <SelectContent>
                  {driverOptions.map((d) => (
                    <SelectItem key={d.driverId} value={d.driverId}>
                      {d.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={busy || !ledgerDriverId}
              onClick={() => void queryLedger()}
              className="gap-1.5"
            >
              {busy ?
                <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />}
              {t('reports.run')}
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t('reports.driverLedgerTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 overflow-x-auto">
              {ledger ?
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">
                        {t('reports.owedToOffice')}
                      </p>
                      <p className="text-lg font-semibold tabular-nums">
                        {formatKwdLabel(ledger.owedToOfficeKd)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ledger.pendingSettlementOrderCount}{' '}
                        {t('reports.ordersPending')}
                      </p>
                    </div>
                    <div className="rounded-xl border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">
                        {t('reports.driver')}
                      </p>
                      <p className="font-medium">{ledger.driver.fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        @{ledger.driver.username}
                      </p>
                    </div>
                  </div>
                  <table className="w-full min-w-[560px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b text-start text-muted-foreground">
                        <th className="py-2 pe-2">{t('reports.colCreated')}</th>
                        <th className="py-2 pe-2">{t('reports.colInvoice')}</th>
                        <th className="py-2 pe-2">{t('reports.colPay')}</th>
                        <th className="py-2 pe-2">{t('reports.cashStatus')}</th>
                        <th className="py-2 text-end">{t('reports.colTotal')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.ordersInPeriod.map((r) => (
                        <tr key={r.id} className="border-b border-border/60">
                          <td className="py-2 pe-2 whitespace-nowrap">
                            {new Date(r.createdAt).toLocaleString(dateLocale)}
                          </td>
                          <td className="py-2 pe-2 font-mono text-xs">
                            {r.invoiceNumber ?? r.id.slice(0, 8)}
                          </td>
                          <td className="py-2 pe-2">
                            {r.posPaymentMethod ?? 'â€”'}
                          </td>
                          <td className="py-2 pe-2">{r.cashStatus}</td>
                          <td className="py-2 text-end tabular-nums">
                            {formatKwdLabel(r.totalPrice)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              : <p className="text-sm text-muted-foreground">{t('reports.runHint')}</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="closing" className="space-y-3">
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void queryClosing()}
              className="gap-1.5"
            >
              {busy ?
                <Loader2 className="h-4 w-4 animate-spin" />
              : <FileDown className="h-4 w-4" />}
              {t('reports.runClosing')}
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t('reports.dailyClosingTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {closing ?
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border p-3">
                    <dt className="text-xs text-muted-foreground">
                      {t('reports.grossCash')}
                    </dt>
                    <dd className="text-lg font-semibold tabular-nums">
                      {formatKwdLabel(closing.grossCashSalesKd)}
                    </dd>
                    <dd className="text-xs text-muted-foreground">
                      {closing.cashOrderCount} {t('reports.cashOrders')}
                    </dd>
                  </div>
                  <div className="rounded-xl border p-3">
                    <dt className="text-xs text-muted-foreground">
                      {t('reports.expensesDeducted')}
                    </dt>
                    <dd className="text-lg font-semibold tabular-nums">
                      {formatKwdLabel(closing.expensesTotalKd)}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">
                      {t('reports.netCash')}
                    </dt>
                    <dd
                      className={cn(
                        'text-xl font-bold tabular-nums',
                        Number.parseFloat(closing.netCashAfterExpensesKd) < 0 &&
                          'text-destructive',
                      )}
                    >
                      {formatKwdLabel(closing.netCashAfterExpensesKd)}
                    </dd>
                  </div>
                </dl>
              : <p className="text-sm text-muted-foreground">{t('reports.runHint')}</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
      {isOwner && token ?
        <LiveOperationsFeed
          token={token}
          prominent
          className="w-full shrink-0 xl:sticky xl:top-16 xl:w-[min(100vw-2rem,420px)] xl:max-w-[min(36vw,460px)]"
        />
      : null}
    </div>
  );
}

