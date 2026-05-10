import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  FileSignature,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  Wallet as WalletIcon,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import {
  ApiError,
  apiJson,
  getUnpaidInvoices,
  recheckOrderPayment,
  type BranchRow,
  type UnpaidInvoicesResponse,
} from '@/lib/api';
import { formatKwdAmount, formatKwdLabel, isMaterialKd } from '@/lib/kwd';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import { Badge } from '@/modules/shared/components/ui/badge';
import { PaymentStatusChip } from '@/modules/finance/components/PaymentStatusChip';
import { Button } from '@/modules/shared/components/ui/button';
import { Input } from '@/modules/shared/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/shared/components/ui/select';
import { Skeleton } from '@/modules/shared/components/ui/skeleton';
import {
  DataTableShell,
  FilterBar,
  FilterField,
  KpiCard,
  PageHeader,
  type DataTableColumn,
} from '@/modules/shared/components/page';
import { TableCell, TableRow } from '@/modules/shared/components/ui/table';
import { cn } from '@/lib/utils';

const ALL_BRANCHES = 'ALL' as const;
const ALL_ACTORS = 'ALL' as const;

/** Same heartbeat as `/collections` — KPIs + table stay aligned with new payments. */
const UNPAID_INVOICES_POLL_MS = 8_000;

type Scope = 'open' | 'all';
type UnpaidRow = UnpaidInvoicesResponse['rows'][number];
type UnpaidKpis = UnpaidInvoicesResponse['kpis'];

function lineKeyUnpaid(
  r: Pick<UnpaidRow, 'orderId' | 'debtSource'>,
): string {
  return `${r.orderId}::${r.debtSource ?? 'INVOICE_SHORTFALL'}`;
}

function receivablesHeadlineKd(kpis: UnpaidKpis | null | undefined): string {
  return kpis?.openDebtKd ?? kpis?.totalMarketUnpaidKd ?? '0';
}

function debtSourceSortRank(
  s: UnpaidRow['debtSource'] | undefined,
): number {
  if (s === 'INVOICE_SHORTFALL') return 0;
  if (s === 'SUBSCRIPTION_OVERUSE') return 1;
  if (s === 'OPEN_UNPAID_ORDER') return 2;
  return 0;
}

function startOfDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toISOString();
}

function endOfDay(iso: string): string {
  return new Date(`${iso}T23:59:59.999`).toISOString();
}

/**
 * "المديونية" — receivables from `INVOICE_SHORTFALL` (all issuers); payments
 * reduce `remainingKd`. Filters, KPIs, 8s poll, printable view.
 */
export function UnpaidInvoicesPage() {
  const { t } = useTranslation();
  const locale = useAppLocale();
  const { user, token } = useAuth();
  const canView = can(user, 'unpaidInvoices.view');

  // Empty date range by default — "show everything that's still open".
  // The operator adds boundaries to drill down by debt-creation date.
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [branchId, setBranchId] = useState<string>(ALL_BRANCHES);
  const [actorUserId, setActorUserId] = useState<string>(ALL_ACTORS);
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [scope, setScope] = useState<Scope>('open');
  const [branches, setBranches] = useState<BranchRow[] | null>(null);
  const [data, setData] = useState<UnpaidInvoicesResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [recheckingOrderId, setRecheckingOrderId] = useState<string | null>(
    null,
  );

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token) return;
      if (!opts?.silent) {
        setLoading(true);
      }
      try {
        const allBranches = branchId === ALL_BRANCHES;
        const res = await getUnpaidInvoices(token, {
          from: fromDate ? startOfDay(fromDate) : undefined,
          to: toDate ? endOfDay(toDate) : undefined,
          branchId: allBranches ? undefined : branchId,
          // Do not pass `marketKpiBranchId` when «كل الفروع»: the red KPI must
          // sum UNPAID orders company-wide; scoping to owner branch only made
          // the card 0 while the table still showed other branches.
          actorUserId: actorUserId === ALL_ACTORS ? undefined : actorUserId,
          customerPhone: customerPhone.trim() || undefined,
        });
        setData(res);
      } catch (e) {
        if (!opts?.silent) {
          toast.error(
            e instanceof ApiError
              ? e.message
              : t('unpaidInvoices.loadError', 'Could not load unpaid invoices.'),
          );
        }
      } finally {
        if (!opts?.silent) {
          setLoading(false);
        }
      }
    },
    [token, fromDate, toDate, branchId, actorUserId, customerPhone, t],
  );

  // Refetch when branch / dates / actor / phone change (`load` updates with them).
  useEffect(() => {
    if (!token || !canView) return;
    void load();
  }, [token, canView, load]);

  useEffect(() => {
    if (!token || !canView) return;
    const id = window.setInterval(() => {
      void load({ silent: true });
    }, UNPAID_INVOICES_POLL_MS);
    return () => window.clearInterval(id);
  }, [token, canView, load]);

  const handlePaymentRecheck = useCallback(
    async (orderId: string) => {
      if (!token) return;
      setRecheckingOrderId(orderId);
      try {
        const res = await recheckOrderPayment(token, orderId);
        if (res.settledNow && res.isPaid) {
          toast.success(res.messageAr);
        } else {
          toast.info(res.messageAr);
        }
        await load({ silent: true });
      } catch (e) {
        toast.error(
          e instanceof ApiError
            ? e.message
            : t('unpaidInvoices.recheckError', 'تعذّر التحقق من الدفع.'),
        );
      } finally {
        setRecheckingOrderId(null);
      }
    },
    [token, load, t],
  );

  useEffect(() => {
    if (!token) return;
    void apiJson<BranchRow[]>('/api/branches', { token })
      .then(setBranches)
      .catch(() => setBranches([]));
  }, [token]);

  // Actor options derived from the response so the dropdown always
  // reflects the people who actually issued these debts — no separate
  // API call needed. Stable order (alphabetical by full name).
  const actorOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; role: string | null }>();
    for (const r of data?.rows ?? []) {
      if (!r.actorUserId || !r.actorUserName) continue;
      if (!map.has(r.actorUserId)) {
        map.set(r.actorUserId, {
          id: r.actorUserId,
          name: r.actorUserName,
          role: r.actorUserRole,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
  }, [data]);

  // If the selected actor disappears from the response (filter change),
  // fall back to "all actors" so the Select never sticks on a stale id.
  useEffect(() => {
    if (actorUserId === ALL_ACTORS) return;
    if (!data) return;
    const exists = actorOptions.some((a) => a.id === actorUserId);
    if (!exists) setActorUserId(ALL_ACTORS);
  }, [data, actorOptions, actorUserId]);

  const visibleRows = useMemo(() => {
    const rows = data?.rows ?? [];
    if (scope === 'open') return rows.filter((r) => r.isOpen);
    return rows;
  }, [data, scope]);

  /** Newest debt line first (`issuedAt` desc); tie-break by order id and debt source. */
  const displayRows = useMemo(() => {
    const rows = [...visibleRows];
    rows.sort((a, b) => {
      const ta = new Date(a.issuedAt).getTime();
      const tb = new Date(b.issuedAt).getTime();
      if (ta !== tb) return tb - ta;
      const o = a.orderId.localeCompare(b.orderId);
      if (o !== 0) return o;
      return debtSourceSortRank(a.debtSource) - debtSourceSortRank(b.debtSource);
    });
    return rows;
  }, [visibleRows]);

  const fmtDate = useCallback(
    (iso: string | null | undefined) =>
      iso
        ? new Date(iso).toLocaleString(locale, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })
        : '—',
    [locale],
  );

  const openPrint = useCallback(() => {
    printReport({
      t: t as unknown as TFn,
      locale,
      rows: displayRows,
      kpis: data?.kpis ?? null,
      filters: {
        fromDate,
        toDate,
        branchName:
          branchId === ALL_BRANCHES
            ? t('unpaidInvoices.printAll', 'All')
            : (branches?.find((b) => b.id === branchId)?.name ??
              t('unpaidInvoices.printAll', 'All')),
        actorName:
          actorUserId === ALL_ACTORS
            ? t('unpaidInvoices.printAll', 'All')
            : (actorOptions.find((a) => a.id === actorUserId)?.name ??
              t('unpaidInvoices.printAll', 'All')),
        customerPhone: customerPhone.trim() || null,
        scope,
      },
    });
  }, [
    t,
    locale,
    displayRows,
    data,
    fromDate,
    toDate,
    branchId,
    branches,
    actorUserId,
    actorOptions,
    customerPhone,
    scope,
  ]);

  if (!canView) return <Navigate to="/dashboard" replace />;

  const cols: DataTableColumn[] = useMemo(() => {
    const base: DataTableColumn[] = [
      { key: 'status', label: t('unpaidInvoices.col.status', 'Status') },
      {
        key: 'debtKind',
        label: t('unpaidInvoices.col.debtKind', 'Type'),
      },
      { key: 'issued', label: t('unpaidInvoices.col.issuedAt', 'Invoice date') },
      { key: 'serial', label: t('unpaidInvoices.col.serial', 'Invoice #') },
      { key: 'customer', label: t('unpaidInvoices.col.customer', 'Customer') },
      { key: 'phone', label: t('unpaidInvoices.col.phone', 'Phone') },
      { key: 'branch', label: t('unpaidInvoices.col.branch', 'Branch') },
      { key: 'actor', label: t('unpaidInvoices.col.actor', 'Issuer') },
      {
        key: 'total',
        label: t('unpaidInvoices.col.invoiceTotal', 'Invoice total'),
        align: 'end',
        numeric: true,
      },
      {
        key: 'paid',
        label: t('unpaidInvoices.col.paid', 'Paid'),
        align: 'end',
        numeric: true,
      },
      {
        key: 'remaining',
        label: t('unpaidInvoices.col.remaining', 'Remaining'),
        align: 'end',
        numeric: true,
      },
    ];
    base.push({
      key: 'cumulativeIndebtedness',
      label: t(
        'unpaidInvoices.col.cumulativeIndebtedness',
        'Cumulative debt (running total per customer)',
      ),
      align: 'end',
      numeric: true,
    });
    base.push({
      key: 'actions',
      label: t('unpaidInvoices.col.actions', 'Actions'),
      align: 'end',
    });
    return base;
  }, [t]);

  const kpis = data?.kpis;

  return (
    <div className="space-y-5">
      <PageHeader
        tone="red"
        title={
          <span className="inline-flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            {t('unpaidInvoices.title', 'Receivables')}
          </span>
        }
        subtitle={t(
          'unpaidInvoices.subtitle',
          'Invoice shortfalls in the debt ledger; payments reduce the remainder.',
        )}
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
              className="gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {t('unpaidInvoices.refresh', 'Refresh')}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={openPrint}
              disabled={loading || !data}
              className="gap-2"
            >
              <Printer className="h-4 w-4" />
              {t('unpaidInvoices.print', 'Print')}
            </Button>
          </div>
        }
      />

      <FilterBar
        actions={
          <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-3">
            <span className="tabular-nums" title={t('unpaidInvoices.pollingHint')}>
              {displayRows.length} / {data?.rows.length ?? 0}
            </span>
            <span className="max-w-[14rem] text-[11px] leading-tight sm:max-w-none">
              {t('unpaidInvoices.pollingHint', {
                seconds: Math.round(UNPAID_INVOICES_POLL_MS / 1000),
              })}
            </span>
          </div>
        }
      >
        <FilterField label={t('unpaidInvoices.filterFrom', 'From')}>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-9 w-40"
          />
        </FilterField>
        <FilterField label={t('unpaidInvoices.filterTo', 'To')}>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-9 w-40"
          />
        </FilterField>
        <FilterField label={t('unpaidInvoices.filterBranch', 'Branch')}>
          <Select
            value={branchId}
            onValueChange={(v) => setBranchId(v ?? ALL_BRANCHES)}
          >
            <SelectTrigger className="h-9 w-48">
              <SelectValue
                placeholder={t('unpaidInvoices.allBranches', 'All branches')}
              >
                {branchId === ALL_BRANCHES
                  ? t('unpaidInvoices.allBranches', 'All branches')
                  : (branches?.find((b) => b.id === branchId)?.name ??
                    t('unpaidInvoices.allBranches', 'All branches'))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_BRANCHES}>
                {t('unpaidInvoices.allBranches', 'All branches')}
              </SelectItem>
              {(branches ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label={t('unpaidInvoices.filterActor', 'Issuer')}>
          <Select
            value={actorUserId}
            onValueChange={(v) => setActorUserId(v ?? ALL_ACTORS)}
          >
            <SelectTrigger className="h-9 w-56">
              <SelectValue
                placeholder={t('unpaidInvoices.allActors', 'All employees')}
              >
                {actorUserId === ALL_ACTORS
                  ? t('unpaidInvoices.allActors', 'All employees')
                  : (actorOptions.find((a) => a.id === actorUserId)?.name ??
                    t('unpaidInvoices.allActors', 'All employees'))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_ACTORS}>
                {t('unpaidInvoices.allActors', 'All employees')}
              </SelectItem>
              {actorOptions.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="flex flex-col">
                    <span>{a.name}</span>
                    {a.role ? (
                      <span className="text-xs text-muted-foreground">
                        {a.role}
                      </span>
                    ) : null}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField
          label={t('unpaidInvoices.filterPhone', 'Customer phone')}
          className="min-w-[14rem]"
        >
          <div className="relative">
            <Search
              className="pointer-events-none absolute start-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              inputMode="numeric"
              dir="ltr"
              placeholder={t('unpaidInvoices.filterPhonePh', '9XXXXXXX')}
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="h-9 ps-8 pe-8 tabular-nums"
            />
            {customerPhone ? (
              <button
                type="button"
                onClick={() => setCustomerPhone('')}
                className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition hover:text-foreground"
                aria-label="Clear"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </FilterField>
        <FilterField label={t('unpaidInvoices.scopeLabel', 'Scope')}>
          <div className="flex gap-1.5">
            {(['open', 'all'] as const).map((s) => {
              const active = scope === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {s === 'open'
                    ? t('unpaidInvoices.scopeOnlyOpen', 'Open only')
                    : t('unpaidInvoices.scopeAll', 'All')}
                </button>
              );
            })}
          </div>
        </FilterField>
      </FilterBar>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="flex flex-col gap-2">
          <KpiCard
            tone="red"
            label={t('unpaidInvoices.kpiOpenDebt', 'Receivables')}
            value={formatKwdLabel(receivablesHeadlineKd(kpis))}
            icon={<AlertTriangle className="h-4 w-4" />}
            deltaBadge={
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {t('unpaidInvoices.kpiOpenDebtHint', {
                  defaultValue: 'Invoices: {{open}} / {{total}}',
                  open: kpis?.openInvoiceCount ?? 0,
                  total: kpis?.invoiceCount ?? 0,
                })}
              </span>
            }
          />
          {kpis?.marketUnpaidByMethod ? (
            <div
              className="rounded-lg border border-border/70 bg-muted/30 px-2.5 py-2"
              role="group"
              aria-label={t(
                'unpaidInvoices.marketByMethodTitle',
                'By collection method (driver / branch manager)',
              )}
            >
              <p className="mb-1.5 text-[10px] font-medium text-muted-foreground sm:text-[11px]">
                {t(
                  'unpaidInvoices.marketByMethodTitle',
                  'By collection method (driver / branch manager)',
                )}
              </p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] tabular-nums sm:text-[11px]">
                {(
                  [
                    ['cashKd', 'unpaidInvoices.methodCash', 'Cash'] as const,
                    ['knetKd', 'unpaidInvoices.methodKnet', 'KNET'] as const,
                    [
                      'onlineKd',
                      'unpaidInvoices.methodOnline',
                      'Online',
                    ] as const,
                    [
                      'paymentLinkKd',
                      'unpaidInvoices.methodPaymentLink',
                      'Payment link',
                    ] as const,
                    [
                      'otherKd',
                      'unpaidInvoices.methodOther',
                      'Other',
                    ] as const,
                  ] as const
                ).map(([key, i18nKey, def]) => {
                  const raw = Number.parseFloat(
                    kpis.marketUnpaidByMethod[key] || '0',
                  );
                  const hide =
                    key === 'otherKd' && (!Number.isFinite(raw) || raw < 0.0001);
                  if (hide) return null;
                  return (
                    <div
                      key={key}
                      className="flex min-w-0 items-center justify-between gap-1"
                    >
                      <span className="shrink-0 text-muted-foreground">
                        {t(i18nKey, def)}
                      </span>
                      <span
                        className="min-w-0 truncate text-end font-medium text-foreground"
                        dir="ltr"
                      >
                        {formatKwdLabel(
                          kpis.marketUnpaidByMethod[key] ?? '0',
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
        <KpiCard
          tone="green"
          label={t('unpaidInvoices.kpiTotalPaid', 'Collected')}
          value={formatKwdLabel(kpis?.totalPaidKd ?? '0')}
          icon={<CheckCircle2 className="h-4 w-4" />}
          deltaBadge={
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {t('unpaidInvoices.kpiTotalPaidHint', {
                defaultValue: 'Payments attributed to these invoices',
              })}
            </span>
          }
        />
        <KpiCard
          tone="orange"
          label={t('unpaidInvoices.kpiOpenCustomers', 'Customers with debt')}
          value={String(kpis?.openCustomerCount ?? 0)}
          icon={<Users className="h-4 w-4" />}
          deltaBadge={
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {t('unpaidInvoices.kpiOpenCustomersHint', {
                defaultValue: 'Total customers in scope: {{total}}',
                total: kpis?.customerCount ?? 0,
              })}
            </span>
          }
        />
        <KpiCard
          tone="blue"
          label={t(
            'unpaidInvoices.kpiTotalInvoices',
            'Total invoices amount',
          )}
          value={formatKwdLabel(kpis?.totalInvoicesKd ?? '0')}
          icon={<WalletIcon className="h-4 w-4" />}
          deltaBadge={
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {t('unpaidInvoices.kpiTotalInvoicesHint', {
                defaultValue: '{{count}} invoice(s) in scope',
                count: kpis?.invoiceCount ?? 0,
              })}
            </span>
          }
        />
        <KpiCard
          tone="green"
          label={t('unpaidInvoices.kpiAvgDebt', 'Avg. debt per invoice')}
          value={formatKwdLabel(kpis?.avgDebtPerInvoiceKd ?? '0')}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950/30">
          <p className="text-[11px] font-medium text-muted-foreground">
            {t('unpaidInvoices.kpiOpenShortfallDebt')}
          </p>
          <p className="mt-0.5 font-semibold tabular-nums text-foreground">
            {formatKwdLabel(kpis?.openShortfallDebtKd ?? '0')}
          </p>
        </div>
        <div className="rounded-lg border border-violet-200/80 bg-violet-50/40 px-3 py-2 text-sm dark:border-violet-900/50 dark:bg-violet-950/20">
          <p className="text-[11px] font-medium text-muted-foreground">
            {t('unpaidInvoices.kpiOpenSubDebt')}
          </p>
          <p className="mt-0.5 font-semibold tabular-nums text-foreground">
            {formatKwdLabel(kpis?.openSubscriptionOveruseDebtKd ?? '0')}
          </p>
        </div>
        <div className="rounded-lg border border-amber-200/80 bg-amber-50/40 px-3 py-2 text-sm dark:border-amber-900/50 dark:bg-amber-950/20">
          <p className="text-[11px] font-medium text-muted-foreground">
            {t('unpaidInvoices.kpiOpenUnpaidOrderOnly')}
          </p>
          <p className="mt-0.5 font-semibold tabular-nums text-foreground">
            {formatKwdLabel(kpis?.openUnpaidOrderBalanceKd ?? '0')}
          </p>
        </div>
      </div>

      {loading && !data ? (
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <DataTableShell
          columns={cols}
          empty={displayRows.length === 0}
          emptyState={t(
            'unpaidInvoices.noInvoices',
            'No invoices match the current filters.',
          )}
          scrollClassName="max-h-[min(72vh,720px)]"
        >
          {displayRows.map((r) => (
            <TableRow key={lineKeyUnpaid(r)}>
              <TableCell>
                <Badge
                  variant="outline"
                  className={cn(
                    'border font-medium',
                    r.isOpen
                      ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
                      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                  )}
                >
                  {r.isOpen
                    ? t('unpaidInvoices.statusOpen', 'Outstanding')
                    : t('unpaidInvoices.statusClosed', 'Settled')}
                </Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs">
                <span
                  className={cn(
                    'inline-flex rounded border px-1.5 py-0.5 font-medium tabular-nums',
                    r.debtSource === 'SUBSCRIPTION_OVERUSE' ?
                      'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200'
                    : r.debtSource === 'OPEN_UNPAID_ORDER' ?
                      'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100'
                    : 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200',
                  )}
                >
                  {r.debtSource === 'SUBSCRIPTION_OVERUSE' ?
                    t('unpaidInvoices.debtKindSubscription', 'Subscription')
                  : r.debtSource === 'OPEN_UNPAID_ORDER' ?
                    t('unpaidInvoices.debtKindUnpaidOrder', 'Unpaid order')
                  : t('unpaidInvoices.debtKindInvoice', 'Invoice (field)')}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                {fmtDate(r.issuedAt)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs font-medium tabular-nums">
                {r.serialNumber ? `#${r.serialNumber}` : '—'}
              </TableCell>
              <TableCell className="min-w-[10rem]">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{r.customerName}</span>
                  {r.customerPhone2 ? (
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {r.customerPhone2}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell
                className="whitespace-nowrap text-xs text-muted-foreground tabular-nums"
                dir="ltr"
              >
                {r.customerPhone ?? '—'}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {r.branchName ?? '—'}
              </TableCell>
              <TableCell className="text-xs">
                <div className="flex flex-col">
                  <span>{r.actorUserName ?? '—'}</span>
                  {r.actorUserRole ? (
                    <span className="text-[10px] text-muted-foreground">
                      {r.actorUserRole}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-end tabular-nums">
                {formatKwdLabel(r.invoiceTotalKd)}
              </TableCell>
              <TableCell className="text-end tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatKwdLabel(r.paidKd)}
              </TableCell>
              <TableCell className="text-end font-semibold tabular-nums text-yellow-600 dark:text-yellow-400">
                <div className="flex flex-col items-end gap-1">
                  <span>{formatKwdLabel(r.remainingKd)}</span>
                  {/*
                    V23.2 — canonical PaymentStatusChip from the
                    V20.7 Financial UI Kit. Status is server-derived
                    (V20.3.1 InvoicePaymentStatusService); never
                    reconstruct from totalPrice − paid here. The
                    legacy enum value `PARTIALLY_PAID` maps to the
                    canonical `PARTIAL`. When the server omits the
                    status (legacy invoice), we hide the chip
                    entirely instead of rendering an em-dash so the
                    operator does not mistake unknown for unpaid.
                  */}
                  {r.paymentStatus ? (
                    <PaymentStatusChip
                      status={
                        r.paymentStatus === 'PARTIALLY_PAID'
                          ? 'PARTIAL'
                          : r.paymentStatus
                      }
                    />
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-end font-semibold tabular-nums text-red-600 dark:text-red-400">
                {formatKwdLabel(
                  r.customerRunningRemainingKd ?? r.remainingKd,
                )}
              </TableCell>
              <TableCell className="w-[1%] whitespace-nowrap">
                {r.isOpen && r.posPaymentMethod === 'PAYMENT_LINK' ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    title={t(
                      'unpaidInvoices.recheckHint',
                      'سحب حالة الدفع من البوابة (مثل صفحة العميل).',
                    )}
                    disabled={recheckingOrderId === r.orderId}
                    onClick={() => void handlePaymentRecheck(r.orderId)}
                  >
                    {recheckingOrderId === r.orderId ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                    )}
                    {t('unpaidInvoices.recheckPayment', 'تحقق')}
                  </Button>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </DataTableShell>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Print helper — opens a new window with a clean, self-contained HTML
// document, then triggers the native print dialog. The style is
// intentionally minimal (black text on white, Cairo font for Arabic)
// so the result is identical on every browser.
// -----------------------------------------------------------------------

type TFn = (key: string, defaultOrOptions?: unknown) => string;

function printReport(args: {
  t: TFn;
  locale: string;
  rows: UnpaidInvoicesResponse['rows'];
  kpis: UnpaidInvoicesResponse['kpis'] | null;
  filters: {
    fromDate: string;
    toDate: string;
    branchName: string;
    actorName: string;
    customerPhone: string | null;
    scope: Scope;
  };
}) {
  const { t, locale, rows, kpis, filters } = args;
  // NOTE: do NOT pass `noopener`/`noreferrer` in the features string —
  // Chromium returns `null` from `window.open()` in that case, so we
  // lose the handle to the new window and the whole print flow goes
  // silent. We need the handle to write the document and trigger print.
  const w = window.open('', '_blank', 'width=1100,height=800');
  if (!w) {
    toast.error(
      t('unpaidInvoices.popupBlocked', 'السماح بالنوافذ المنبثقة مطلوب للطباعة.'),
    );
    return;
  }

  const esc = (s: string | null | undefined) =>
    (s ?? '—').replace(
      /[&<>"']/g,
      (c) =>
        (
          { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<
            string,
            string
          >
        )[c]!,
    );

  const money = (kd: string | number | null | undefined) => {
    return formatKwdAmount(kd ?? '0');
  };

  const fmtDate = (iso: string | null | undefined) =>
    iso
      ? new Date(iso).toLocaleString(locale, {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      : '—';

  const now = new Date().toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const rangeLabel =
    filters.fromDate || filters.toDate
      ? `${filters.fromDate || '…'} → ${filters.toDate || '…'}`
      : t('unpaidInvoices.printAll', 'All');

  const m = kpis?.marketUnpaidByMethod;
  const methodPrintRow = (label: string, kd: string | undefined) =>
    `<div class="mr"><span class="mk">${esc(label)}</span><span class="mv" dir="ltr">${money(kd)} KD</span></div>`;
  const printMethodBlock =
    m
      ? `<div class="method-print">
      <div class="method-print-title">${esc(t('unpaidInvoices.marketByMethodTitle', 'By collection method (driver / branch manager)'))}</div>
      <div class="method-print-grid">
        ${methodPrintRow(t('unpaidInvoices.methodCash', 'Cash'), m.cashKd)}
        ${methodPrintRow(t('unpaidInvoices.methodKnet', 'KNET'), m.knetKd)}
        ${methodPrintRow(t('unpaidInvoices.methodOnline', 'Online'), m.onlineKd)}
        ${methodPrintRow(t('unpaidInvoices.methodPaymentLink', 'Payment link'), m.paymentLinkKd)}
        ${isMaterialKd(m.otherKd) ? methodPrintRow(t('unpaidInvoices.methodOther', 'Other'), m.otherKd) : ''}
      </div>
    </div>`
      : '';

  const bodyRows =
    rows.length > 0
      ? rows
          .map(
            (r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${
          r.debtSource === 'SUBSCRIPTION_OVERUSE'
            ? esc(t('unpaidInvoices.debtKindSubscription', 'Subscription'))
            : r.debtSource === 'OPEN_UNPAID_ORDER'
              ? esc(t('unpaidInvoices.debtKindUnpaidOrder', 'Unpaid order'))
              : esc(t('unpaidInvoices.debtKindInvoice', 'Invoice (field)'))
        }</td>
        <td>${esc(fmtDate(r.issuedAt))}</td>
        <td class="mono">${esc(r.serialNumber)}</td>
        <td>${esc(r.customerName)}</td>
        <td class="mono" dir="ltr">${esc(r.customerPhone)}</td>
        <td>${esc(r.branchName)}</td>
        <td>${esc(r.actorUserName)}</td>
        <td class="num">${money(r.invoiceTotalKd)}</td>
        <td class="num paid">${money(r.paidKd)}</td>
        <td class="num rem">${money(r.remainingKd)}</td>
        <td class="num cum">${money(r.customerRunningRemainingKd ?? r.remainingKd)}</td>
      </tr>`,
          )
          .join('')
      : `<tr><td colspan="12" class="empty">${esc(t('unpaidInvoices.printNoRows', 'No rows.'))}</td></tr>`;

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(t('unpaidInvoices.printTitle', 'Unpaid invoices list'))}</title>
  <style>
    @page { size: A4 landscape; margin: 14mm 10mm; }
    :root {
      --fg: #0f172a;
      --muted: #475569;
      --line: #cbd5e1;
      --line-soft: #e2e8f0;
      --red: #b91c1c;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 12px/1.45 "Cairo", "Tahoma", system-ui, -apple-system, sans-serif;
      color: var(--fg);
      background: #fff;
    }
    .doc { padding: 0; }
    header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 24px;
      border-bottom: 2px solid var(--fg);
      padding-bottom: 10px;
      margin-bottom: 10px;
    }
    .title h1 {
      font-size: 20px; margin: 0 0 2px; letter-spacing: 0.3px;
    }
    .title p { margin: 0; color: var(--muted); font-size: 11px; }
    .stamp {
      border: 1.5px solid var(--fg);
      padding: 6px 10px;
      font-size: 11px;
      line-height: 1.3;
      border-radius: 6px;
      min-width: 170px;
    }
    .stamp .k { color: var(--muted); font-size: 10px; }
    .stamp .v { font-weight: 600; }
    .filters {
      display: grid;
      grid-template-columns: repeat(4, minmax(0,1fr));
      gap: 6px 12px;
      margin-bottom: 10px;
      border: 1px dashed var(--line);
      padding: 8px 10px;
      border-radius: 6px;
      font-size: 11px;
    }
    .filters .row { display: flex; gap: 4px; align-items: baseline; }
    .filters .k { color: var(--muted); min-width: 60px; }
    .filters .v { font-weight: 600; }
    .kpis {
      display: grid;
      grid-template-columns: repeat(5, minmax(0,1fr));
      gap: 8px;
      margin-bottom: 12px;
    }
    .kpi {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 8px 10px;
    }
    .kpi .k { color: var(--muted); font-size: 10px; margin-bottom: 2px; }
    .kpi .v {
      font-size: 18px; font-weight: 700; letter-spacing: 0.2px;
      font-variant-numeric: tabular-nums;
    }
    .kpi.red .v { color: var(--red); }
    .method-print {
      border: 1px dashed var(--line);
      border-radius: 6px;
      padding: 8px 10px;
      margin-bottom: 12px;
      font-size: 10px;
    }
    .method-print-title { color: var(--muted); font-weight: 600; margin-bottom: 6px; }
    .method-print-grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 4px 10px;
    }
    .method-print .mr { display: flex; justify-content: space-between; gap: 6px; align-items: baseline; }
    .method-print .mk { color: var(--muted); }
    .method-print .mv { font-weight: 700; font-variant-numeric: tabular-nums; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    thead th {
      text-align: start;
      background: #f1f5f9;
      color: var(--fg);
      font-weight: 700;
      border: 1px solid var(--line);
      padding: 6px 6px;
      white-space: nowrap;
    }
    tbody td {
      padding: 6px 6px;
      border: 1px solid var(--line-soft);
      vertical-align: top;
    }
    tbody tr:nth-child(even) td { background: #fafafa; }
    td.num, th.num { text-align: end; font-variant-numeric: tabular-nums; }
    td.mono { font-variant-numeric: tabular-nums; }
    td.rem { color: #ca8a04; font-weight: 700; }
    td.cum { color: var(--red); font-weight: 700; }
    td.paid { color: #047857; font-weight: 600; }
    td.muted { color: var(--muted); }
    td.empty { text-align: center; color: var(--muted); padding: 16px; }
    footer {
      margin-top: 14px;
      font-size: 10px;
      color: var(--muted);
      border-top: 1px solid var(--line-soft);
      padding-top: 6px;
      text-align: center;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="doc">
    <header>
      <div class="title">
        <h1>${esc(t('unpaidInvoices.printTitle', 'Unpaid invoices list'))}</h1>
        <p>${esc(t('unpaidInvoices.printSubtitle', ''))}</p>
      </div>
      <div class="stamp">
        <div><span class="k">${esc(t('unpaidInvoices.printGeneratedAt', 'Generated'))}: </span><span class="v">${esc(now)}</span></div>
        <div><span class="k">${esc(t('unpaidInvoices.printRange', 'Range'))}: </span><span class="v mono">${esc(rangeLabel)}</span></div>
      </div>
    </header>

    <div class="filters">
      <div class="row"><span class="k">${esc(t('unpaidInvoices.printBranch', 'Branch'))}:</span><span class="v">${esc(filters.branchName)}</span></div>
      <div class="row"><span class="k">${esc(t('unpaidInvoices.printActor', 'Employee'))}:</span><span class="v">${esc(filters.actorName)}</span></div>
      <div class="row"><span class="k">${esc(t('unpaidInvoices.printPhone', 'Phone'))}:</span><span class="v mono" dir="ltr">${esc(filters.customerPhone ?? t('unpaidInvoices.printAll', 'All'))}</span></div>
      <div class="row"><span class="k">${esc(t('unpaidInvoices.scopeLabel', 'Scope'))}:</span><span class="v">${filters.scope === 'open' ? esc(t('unpaidInvoices.scopeOnlyOpen', 'Open only')) : esc(t('unpaidInvoices.scopeAll', 'All'))}</span></div>
    </div>

    <div class="kpis">
      <div class="kpi red">
        <div class="k">${esc(t('unpaidInvoices.printOpenDebt', 'Receivables'))}</div>
        <div class="v">${money(receivablesHeadlineKd(kpis))} KD</div>
      </div>
      <div class="kpi">
        <div class="k">${esc(t('unpaidInvoices.printTotalPaid', 'Collected'))}</div>
        <div class="v">${money(kpis?.totalPaidKd)} KD</div>
      </div>
      <div class="kpi">
        <div class="k">${esc(t('unpaidInvoices.printTotalInvoices', 'Total invoices amount'))}</div>
        <div class="v">${money(kpis?.totalInvoicesKd)} KD</div>
      </div>
      <div class="kpi">
        <div class="k">${esc(t('unpaidInvoices.printInvoices', 'Invoices'))}</div>
        <div class="v">${rows.length}</div>
      </div>
      <div class="kpi">
        <div class="k">${esc(t('unpaidInvoices.printOpenInvoices', 'Open'))}</div>
        <div class="v">${kpis?.openInvoiceCount ?? 0}</div>
      </div>
    </div>
    ${printMethodBlock}

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>${esc(t('unpaidInvoices.col.debtKind', 'Type'))}</th>
          <th>${esc(t('unpaidInvoices.col.issuedAt', 'Invoice date'))}</th>
          <th>${esc(t('unpaidInvoices.col.serial', 'Invoice #'))}</th>
          <th>${esc(t('unpaidInvoices.col.customer', 'Customer'))}</th>
          <th>${esc(t('unpaidInvoices.col.phone', 'Phone'))}</th>
          <th>${esc(t('unpaidInvoices.col.branch', 'Branch'))}</th>
          <th>${esc(t('unpaidInvoices.col.actor', 'Issuer'))}</th>
          <th class="num">${esc(t('unpaidInvoices.col.invoiceTotal', 'Invoice total'))}</th>
          <th class="num">${esc(t('unpaidInvoices.col.paid', 'Paid'))}</th>
          <th class="num">${esc(t('unpaidInvoices.col.remaining', 'Remaining'))}</th>
          <th class="num">${esc(t('unpaidInvoices.col.cumulativeIndebtedness', 'Cumulative debt'))}</th>
        </tr>
      </thead>
      <tbody>
        ${bodyRows}
      </tbody>
    </table>

    <footer>${esc(t('unpaidInvoices.printFooter', ''))}</footer>
    <div class="no-print" style="margin-top:16px;text-align:center;">
      <button id="__print"
        style="padding:8px 20px;font:600 12px 'Cairo',sans-serif;border:1px solid #0f172a;background:#0f172a;color:#fff;border-radius:6px;cursor:pointer;">
        ${esc(t('unpaidInvoices.print', 'طباعة'))}
      </button>
    </div>
  </div>
  <script>
    (function(){
      var b = document.getElementById('__print');
      if (b) b.addEventListener('click', function(){ window.focus(); window.print(); });
      // Auto-trigger once fonts + layout settle. setTimeout is more
      // reliable than 'load' here because document.write() can fire
      // load before our script runs.
      setTimeout(function(){ try { window.focus(); window.print(); } catch(e){} }, 400);
    })();
  </script>
  <style media="print">
    .no-print { display: none !important; }
  </style>
</body>
</html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
}
