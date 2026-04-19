import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { FileDown, FileSpreadsheet, Loader2, Printer, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import {
  type DailyCashClosingReport,
  type DriverBalanceResponse,
  type DriverLedgerReport,
  type IssuedInvoicesReport,
  apiJson,
  ApiError,
  exportIssuedInvoicesPdf,
  exportIssuedInvoicesXlsx,
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
import { cn } from '@/lib/utils';
import { orderStatusChipClass } from '@/lib/safari-ui';

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
  const { token, ownerBranchId, user } = useAuth();
  const [from, setFrom] = useState(() => startOfDayIso(new Date()));
  const [to, setTo] = useState(() => endOfDayIso(new Date()));
  const [payFilter, setPayFilter] = useState<string>('ALL');
  const [driverFilter, setDriverFilter] = useState<string>('ALL');
  const [drivers, setDrivers] = useState<DriverBalanceResponse | null>(null);
  const [ledgerDriverId, setLedgerDriverId] = useState<string>('');

  const [invoices, setInvoices] = useState<IssuedInvoicesReport | null>(null);
  const [ledger, setLedger] = useState<DriverLedgerReport | null>(null);
  const [closing, setClosing] = useState<DailyCashClosingReport | null>(null);
  const [busy, setBusy] = useState(false);

  /** Operational reports (invoices / ledger / closing). P&L lives on Financials (OWNER). */
  const canView = can(user, 'reports.view');

  // Safari Pulse live feed — OWNER only at the API layer.
  const canSeePulse = can(user, 'liveMonitor.view');

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

  const effectiveLedgerDriverId = useMemo(
    () => (driverFilter !== 'ALL' ? driverFilter : ledgerDriverId),
    [driverFilter, ledgerDriverId],
  );

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
    if (!token || !effectiveLedgerDriverId) return;
    setBusy(true);
    try {
      const qs = new URLSearchParams({
        driverId: effectiveLedgerDriverId,
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
  }, [token, from, to, effectiveLedgerDriverId, branchQs]);

  const queryClosing = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    try {
      const qs = new URLSearchParams({ from, to, ...branchQs });
      if (driverFilter !== 'ALL') qs.set('driverId', driverFilter);
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
  }, [token, from, to, branchQs, driverFilter]);

  if (!canView) {
    return <Navigate to="/" replace />;
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-6 xl:flex-row xl:items-start',
        canSeePulse ? 'xl:gap-8' : 'xl:gap-6',
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
            {t('reports.exportPdf')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!token || !invoices?.rows.length}
            onClick={async () => {
              if (!token) return;
              try {
                await exportIssuedInvoicesXlsx(token, {
                  from,
                  to,
                  driverId:
                    driverFilter !== 'ALL' ? driverFilter : undefined,
                  branchId: ownerBranchId ?? undefined,
                });
              } catch (e) {
                toast.error(
                  e instanceof ApiError ? e.message : 'فشل تصدير Excel',
                );
              }
            }}
          >
            <FileSpreadsheet className="h-4 w-4" />
            {t('reports.exportXlsx')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!token || !invoices?.rows.length}
            onClick={async () => {
              if (!token) return;
              try {
                await exportIssuedInvoicesPdf(token, {
                  from,
                  to,
                  driverId:
                    driverFilter !== 'ALL' ? driverFilter : undefined,
                  branchId: ownerBranchId ?? undefined,
                });
              } catch (e) {
                toast.error(
                  e instanceof ApiError ? e.message : 'فشل تصدير PDF',
                );
              }
            }}
          >
            <FileDown className="h-4 w-4" />
            {t('reports.exportServerPdf')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!invoices?.rows.length}
            onClick={() => {
              if (!invoices?.rows.length) return;
              const cell = (s: string) => `"${s.replaceAll('"', '""')}"`;
              const header = [
                'createdAt',
                'invoice',
                'customer',
                'driver',
                'pay',
                'status',
                'total',
              ];
              const lines = invoices.rows.map((r) =>
                [
                  r.createdAt,
                  r.invoiceNumber ?? r.id,
                  cell(r.customer.displayName ?? r.customer.phone),
                  cell(r.driver?.fullName ?? ''),
                  r.posPaymentMethod ?? '',
                  r.status,
                  r.totalPrice,
                ].join(','),
              );
              const blob = new Blob([[header.join(','), ...lines].join('\n')], {
                type: 'text/csv;charset=utf-8;',
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `issued-invoices-${from.slice(0, 10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <FileDown className="h-4 w-4" />
            {t('reports.exportCsv')}
          </Button>
        </div>
      </div>

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
              onValueChange={(v) => {
                const x = v ?? 'ALL';
                setDriverFilter(x);
                if (x !== 'ALL') setLedgerDriverId(x);
              }}
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
                    {invoices.count} {t('reports.rows')} ·{' '}
                    {new Date(invoices.from).toLocaleString(dateLocale)} —{' '}
                    {new Date(invoices.to).toLocaleString(dateLocale)}
                  </p>
                  <table className="safari-data-table min-w-[640px]">
                    <thead>
                      <tr>
                        <th>{t('reports.colCreated')}</th>
                        <th>{t('reports.colInvoice')}</th>
                        <th>{t('reports.colCustomer')}</th>
                        <th>{t('reports.colDriver')}</th>
                        <th>{t('reports.colPay')}</th>
                        <th>{t('reports.colStatus')}</th>
                        <th className="text-end">{t('reports.colTotal')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.rows.map((r) => (
                        <tr key={r.id}>
                          <td className="whitespace-nowrap text-muted-foreground">
                            {new Date(r.createdAt).toLocaleString(dateLocale)}
                          </td>
                          <td className="font-mono text-xs safari-table-primary">
                            {r.invoiceNumber ?? r.id.slice(0, 8)}
                          </td>
                          <td className="max-w-[200px] whitespace-normal safari-table-primary">
                            {r.customer.displayName ?? r.customer.phone}
                          </td>
                          <td>{r.driver?.fullName ?? '—'}</td>
                          <td>{r.posPaymentMethod ?? '—'}</td>
                          <td>
                            <span className={orderStatusChipClass(r.status)}>
                              {r.status.replaceAll('_', ' ')}
                            </span>
                          </td>
                          <td className="text-end font-semibold tabular-nums">
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
          <p className="text-xs text-muted-foreground print:hidden">
            {t('reports.ledgerUsesDriverFilter')}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end print:hidden">
            <Button
              type="button"
              size="sm"
              disabled={busy || !effectiveLedgerDriverId}
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
                  <table className="safari-data-table min-w-[560px]">
                    <thead>
                      <tr>
                        <th>{t('reports.colCreated')}</th>
                        <th>{t('reports.colInvoice')}</th>
                        <th>{t('reports.colPay')}</th>
                        <th>{t('reports.cashStatus')}</th>
                        <th className="text-end">{t('reports.colTotal')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.ordersInPeriod.map((r) => (
                        <tr key={r.id}>
                          <td className="whitespace-nowrap text-muted-foreground">
                            {new Date(r.createdAt).toLocaleString(dateLocale)}
                          </td>
                          <td className="font-mono text-xs safari-table-primary">
                            {r.invoiceNumber ?? r.id.slice(0, 8)}
                          </td>
                          <td>{r.posPaymentMethod ?? '—'}</td>
                          <td>{r.cashStatus}</td>
                          <td className="text-end font-semibold tabular-nums">
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
      {canSeePulse && token ?
        <LiveOperationsFeed
          token={token}
          prominent
          className="w-full shrink-0 xl:sticky xl:top-16 xl:w-[min(100vw-2rem,420px)] xl:max-w-[min(36vw,460px)]"
        />
      : null}
    </div>
  );
}

