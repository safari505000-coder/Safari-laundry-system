import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import {
  ChevronDown,
  FileDown,
  FileSpreadsheet,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Printer,
  RefreshCw,
  Receipt,
  Wallet,
  Banknote,
  CreditCard,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { notify } from '@/lib/notify';
import { can } from '@/modules/shared/auth/access-matrix';
import {
  type DailyCashClosingReport,
  type DriverBalanceResponse,
  type DriverLedgerReport,
  type IssuedInvoicesReport,
  apiJson,
  exportIssuedInvoicesPdf,
  exportIssuedInvoicesXlsx,
} from '@/lib/api';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import { formatKwdLabel } from '@/lib/kwd';
import { Button, buttonVariants } from '@/modules/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import { Input } from '@/modules/shared/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/shared/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/modules/shared/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/modules/shared/components/ui/dropdown-menu';
import { TableCell, TableRow } from '@/modules/shared/components/ui/table';
import {
  DataTableShell,
  FilterBar,
  FilterField,
  KpiCard,
  PageHeader,
} from '@/modules/shared/components/page';
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

type QuickRange = 'today' | 'week' | 'month' | '30d';

function computeRange(range: QuickRange): { from: string; to: string } {
  const now = new Date();
  const to = endOfDayIso(now);
  if (range === 'today') {
    return { from: startOfDayIso(now), to };
  }
  if (range === 'week') {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    return { from: startOfDayIso(from), to };
  }
  if (range === '30d') {
    const from = new Date(now);
    from.setDate(from.getDate() - 29);
    return { from: startOfDayIso(from), to };
  }
  // month
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: startOfDayIso(from), to };
}

/**
 * V19.9.6 — Operational reports page (issued invoices, driver ledger, cash closing).
 * Reached from `/reports` or the Operations & insights hub (`/operational-reports-hub`).
 *
 * Rebuilt on the shared page primitives (PageHeader, FilterBar, KpiCard,
 * DataTableShell) and consolidated so every tab has the same rhythm:
 *
 *   1. Page header with title + single "Export" dropdown.
 *   2. FilterBar — date range, quick-range chips, driver, payment method
 *      and a primary "Run" CTA in the actions slot. No duplicate filters
 *      card, no duplicate Run buttons per tab.
 *   3. Summary KPIs (invoices count, total value, cash count, KNET count
 *      or driver-specific KPIs) — rendered only when there is data.
 *   4. Data table / summary card inside a DataTableShell or Card.
 *   5. Pulse (live ops feed) is collapsible — hidden by default on xl so
 *      the main report has room to breathe; users reopen it with a
 *      single click from the header.
 */
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
  const [activeTab, setActiveTab] = useState<'invoices' | 'ledger' | 'closing'>(
    'invoices',
  );
  const [pulseOpen, setPulseOpen] = useState(false);

  const canView = can(user, 'reports.view');
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
          setLedgerDriverId((prev) => prev || d.drivers[0]?.driverId || '');
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
      notify.error(e);
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
      notify.error(e);
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
      notify.error(e);
    } finally {
      setBusy(false);
    }
  }, [token, from, to, branchQs, driverFilter]);

  const runActiveTab = useCallback(() => {
    if (activeTab === 'invoices') void queryInvoices();
    else if (activeTab === 'ledger') void queryLedger();
    else void queryClosing();
  }, [activeTab, queryInvoices, queryLedger, queryClosing]);

  const applyQuickRange = useCallback((range: QuickRange) => {
    const r = computeRange(range);
    setFrom(r.from);
    setTo(r.to);
  }, []);

  const exportCsv = useCallback(() => {
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
  }, [invoices, from]);

  const invoiceTotals = useMemo(() => {
    if (!invoices?.rows.length) {
      return { count: 0, total: 0, cash: 0, knet: 0 };
    }
    let total = 0;
    let cash = 0;
    let knet = 0;
    for (const r of invoices.rows) {
      total += Number.parseFloat(r.totalPrice ?? '0') || 0;
      if (r.posPaymentMethod === 'CASH') cash += 1;
      else if (r.posPaymentMethod === 'KNET') knet += 1;
    }
    return { count: invoices.rows.length, total, cash, knet };
  }, [invoices]);

  const hasExportable = !!invoices?.rows.length;

  if (!canView) {
    return <Navigate to="/" replace />;
  }

  const headerActions = (
    <>
      {canSeePulse ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => setPulseOpen((v) => !v)}
          aria-pressed={pulseOpen}
        >
          {pulseOpen ? (
            <PanelRightClose className="h-4 w-4" />
          ) : (
            <PanelRightOpen className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">
            {pulseOpen
              ? t('reports.pulseToggleHide')
              : t('reports.pulseToggleShow')}
          </span>
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={!token}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            'gap-1.5',
          )}
        >
          <FileDown className="h-4 w-4" />
          <span>{t('reports.export')}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[200px]">
          <DropdownMenuItem onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            <span>{t('reports.exportLabelPrint')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!hasExportable}
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
                notify.error(e, { fallback: 'فشل تصدير Excel' });
              }
            }}
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>{t('reports.exportLabelXlsx')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!hasExportable}
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
                notify.error(e, { fallback: 'فشل تصدير PDF' });
              }
            }}
          >
            <FileDown className="h-4 w-4" />
            <span>{t('reports.exportLabelPdf')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!hasExportable} onClick={exportCsv}>
            <FileDown className="h-4 w-4" />
            <span>{t('reports.exportLabelCsv')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  const quickRanges: { id: QuickRange; labelKey: string }[] = [
    { id: 'today', labelKey: 'reports.quickRangeToday' },
    { id: 'week', labelKey: 'reports.quickRangeWeek' },
    { id: '30d', labelKey: 'reports.quickRange30' },
    { id: 'month', labelKey: 'reports.quickRangeMonth' },
  ];

  return (
    <div
      className={cn(
        'flex flex-col gap-6 xl:flex-row xl:items-start',
        pulseOpen ? 'xl:gap-8' : 'xl:gap-6',
      )}
    >
      <div className="min-w-0 flex-1 space-y-5">
        <PageHeader
          title={t('reports.title')}
          subtitle={t('reports.subtitle')}
          tone="blue"
          actions={headerActions}
        />

        <FilterBar
          actions={
            <Button
              type="button"
              size="sm"
              disabled={busy || !token}
              onClick={runActiveTab}
              className="gap-1.5"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {t('reports.run')}
            </Button>
          }
        >
          <FilterField label={t('reports.from')} className="min-w-[10rem]">
            <Input
              id="rep-from"
              type="datetime-local"
              value={from.slice(0, 16)}
              onChange={(e) => setFrom(new Date(e.target.value).toISOString())}
            />
          </FilterField>
          <FilterField label={t('reports.to')} className="min-w-[10rem]">
            <Input
              id="rep-to"
              type="datetime-local"
              value={to.slice(0, 16)}
              onChange={(e) => setTo(new Date(e.target.value).toISOString())}
            />
          </FilterField>
          <FilterField
            label={t('reports.paymentMethod')}
            className="min-w-[9rem]"
          >
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
          </FilterField>
          <FilterField label={t('reports.driver')} className="min-w-[11rem]">
            <Select
              value={driverFilter}
              onValueChange={(v) => {
                const x = v ?? 'ALL';
                setDriverFilter(x);
                if (x !== 'ALL') setLedgerDriverId(x);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('reports.all')}>
                  {driverFilter === 'ALL'
                    ? t('reports.all')
                    : (driverOptions.find(
                        (d) => d.driverId === driverFilter,
                      )?.fullName ?? t('reports.all'))}
                </SelectValue>
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
          </FilterField>
        </FilterBar>

        <div className="-mt-2 flex flex-wrap gap-1.5 print:hidden">
          {quickRanges.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => applyQuickRange(q.id)}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              {t(q.labelKey)}
            </button>
          ))}
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as typeof activeTab)}
          className="space-y-4"
        >
          <TabsList className="grid w-full max-w-xl grid-cols-3 print:hidden">
            <TabsTrigger value="invoices">
              {t('reports.tabInvoicesShort')}
            </TabsTrigger>
            <TabsTrigger value="ledger">
              {t('reports.tabLedgerShort')}
            </TabsTrigger>
            <TabsTrigger value="closing">
              {t('reports.tabClosingShort')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="invoices" className="space-y-4">
            {invoices ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <KpiCard
                    tone="blue"
                    icon={<Receipt className="h-4 w-4" />}
                    label={t('reports.kpiInvoices')}
                    value={invoiceTotals.count}
                  />
                  <KpiCard
                    tone="green"
                    icon={<Wallet className="h-4 w-4" />}
                    label={t('reports.kpiTotal')}
                    value={formatKwdLabel(invoiceTotals.total.toFixed(3))}
                  />
                  <KpiCard
                    tone="orange"
                    icon={<Banknote className="h-4 w-4" />}
                    label={t('reports.kpiCashCount')}
                    value={invoiceTotals.cash}
                  />
                  <KpiCard
                    tone="purple"
                    icon={<CreditCard className="h-4 w-4" />}
                    label={t('reports.kpiKnetCount')}
                    value={invoiceTotals.knet}
                  />
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {new Date(invoices.from).toLocaleString(dateLocale)} —{' '}
                  {new Date(invoices.to).toLocaleString(dateLocale)}
                </p>
                <DataTableShell
                  columns={[
                    { key: 'created', label: t('reports.colCreated') },
                    { key: 'invoice', label: t('reports.colInvoice') },
                    { key: 'customer', label: t('reports.colCustomer') },
                    { key: 'driver', label: t('reports.colDriver') },
                    { key: 'pay', label: t('reports.colPay') },
                    { key: 'status', label: t('reports.colStatus') },
                    {
                      key: 'total',
                      label: t('reports.colTotal'),
                      align: 'end',
                      numeric: true,
                    },
                  ]}
                  empty={invoices.rows.length === 0}
                  emptyState={t('reports.empty')}
                  scrollClassName="max-h-[70vh]"
                >
                  {invoices.rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                        {new Date(r.createdAt).toLocaleString(dateLocale)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.invoiceNumber ?? r.id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="max-w-[220px] whitespace-normal">
                        {r.customer.displayName ?? r.customer.phone}
                      </TableCell>
                      <TableCell>{r.driver?.fullName ?? '—'}</TableCell>
                      <TableCell>{r.posPaymentMethod ?? '—'}</TableCell>
                      <TableCell>
                        <span className={orderStatusChipClass(r.status)}>
                          {r.status.replaceAll('_', ' ')}
                        </span>
                      </TableCell>
                      <TableCell className="text-end font-semibold tabular-nums">
                        {formatKwdLabel(r.totalPrice)}
                      </TableCell>
                    </TableRow>
                  ))}
                </DataTableShell>
              </>
            ) : (
              <EmptyReportHint
                message={t('reports.runHint')}
                busy={busy}
              />
            )}
          </TabsContent>

          <TabsContent value="ledger" className="space-y-4">
            <p className="text-xs text-muted-foreground print:hidden">
              {t('reports.ledgerUsesDriverFilter')}
            </p>
            {ledger ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <KpiCard
                    tone="red"
                    icon={<Wallet className="h-4 w-4" />}
                    label={t('reports.owedToOffice')}
                    value={formatKwdLabel(ledger.owedToOfficeKd)}
                    deltaBadge={`${ledger.pendingSettlementOrderCount} ${t(
                      'reports.ordersPending',
                    )}`}
                  />
                  <KpiCard
                    tone="blue"
                    icon={<Receipt className="h-4 w-4" />}
                    label={t('reports.driver')}
                    value={ledger.driver.fullName}
                    deltaBadge={`@${ledger.driver.username}`}
                  />
                  <KpiCard
                    tone="green"
                    icon={<Banknote className="h-4 w-4" />}
                    label={t('reports.kpiInvoices')}
                    value={ledger.ordersInPeriod.length}
                  />
                </div>
                <DataTableShell
                  columns={[
                    { key: 'created', label: t('reports.colCreated') },
                    { key: 'invoice', label: t('reports.colInvoice') },
                    { key: 'pay', label: t('reports.colPay') },
                    { key: 'cash', label: t('reports.cashStatus') },
                    {
                      key: 'total',
                      label: t('reports.colTotal'),
                      align: 'end',
                      numeric: true,
                    },
                  ]}
                  empty={ledger.ordersInPeriod.length === 0}
                  emptyState={t('reports.empty')}
                  scrollClassName="max-h-[65vh]"
                >
                  {ledger.ordersInPeriod.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                        {new Date(r.createdAt).toLocaleString(dateLocale)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.invoiceNumber ?? r.id.slice(0, 8)}
                      </TableCell>
                      <TableCell>{r.posPaymentMethod ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.cashStatus}
                      </TableCell>
                      <TableCell className="text-end font-semibold tabular-nums">
                        {formatKwdLabel(r.totalPrice)}
                      </TableCell>
                    </TableRow>
                  ))}
                </DataTableShell>
              </>
            ) : (
              <EmptyReportHint
                message={t('reports.runHint')}
                busy={busy}
              />
            )}
          </TabsContent>

          <TabsContent value="closing" className="space-y-4">
            {closing ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <KpiCard
                  tone="green"
                  icon={<Banknote className="h-4 w-4" />}
                  label={t('reports.grossCash')}
                  value={formatKwdLabel(closing.grossCashSalesKd)}
                  deltaBadge={`${closing.cashOrderCount} ${t(
                    'reports.cashOrders',
                  )}`}
                />
                <KpiCard
                  tone="orange"
                  icon={<Receipt className="h-4 w-4" />}
                  label={t('reports.expensesDeducted')}
                  value={formatKwdLabel(closing.expensesTotalKd)}
                />
                <Card
                  size="sm"
                  className={cn(
                    'flex-row items-start justify-between gap-3 border-primary/40 bg-primary/5 px-4',
                    Number.parseFloat(closing.netCashAfterExpensesKd) < 0 &&
                      'border-destructive/40 bg-destructive/5',
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-muted-foreground">
                      {t('reports.netCash')}
                    </p>
                    <p
                      className={cn(
                        'mt-1 text-xl font-bold tabular-nums text-foreground',
                        Number.parseFloat(closing.netCashAfterExpensesKd) <
                          0 && 'text-destructive',
                      )}
                    >
                      {formatKwdLabel(closing.netCashAfterExpensesKd)}
                    </p>
                  </div>
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary',
                      Number.parseFloat(closing.netCashAfterExpensesKd) <
                        0 && 'bg-destructive/10 text-destructive',
                    )}
                  >
                    <Wallet className="h-4 w-4" />
                  </div>
                </Card>
              </div>
            ) : (
              <EmptyReportHint
                message={t('reports.runHint')}
                busy={busy}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>

      {canSeePulse && token && pulseOpen ? (
        <LiveOperationsFeed
          token={token}
          prominent
          className="w-full shrink-0 xl:sticky xl:top-16 xl:w-[min(100vw-2rem,420px)] xl:max-w-[min(36vw,460px)]"
        />
      ) : null}
    </div>
  );
}

function EmptyReportHint({
  message,
  busy,
}: {
  message: string;
  busy: boolean;
}) {
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {busy ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>…</span>
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}
