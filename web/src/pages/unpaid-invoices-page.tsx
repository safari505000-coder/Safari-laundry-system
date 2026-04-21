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
  type BranchRow,
  type UnpaidInvoicesResponse,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import { Badge } from '@/modules/shared/components/ui/badge';
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

type Scope = 'open' | 'all';

function startOfDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toISOString();
}

function endOfDay(iso: string): string {
  return new Date(`${iso}T23:59:59.999`).toISOString();
}

/**
 * V19.10 — "قائمة مديونيات الفواتير" page.
 *
 * Every invoice that still carries outstanding customer debt, with
 * filters (date, branch, issuer, phone), KPIs, and a printable view.
 *
 * Visible to OWNER / GENERAL_MANAGER / ACCOUNTANT / CALL_CENTER /
 * CALL_CENTER_SUPERVISOR.
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

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await getUnpaidInvoices(token, {
        from: fromDate ? startOfDay(fromDate) : undefined,
        to: toDate ? endOfDay(toDate) : undefined,
        branchId: branchId === ALL_BRANCHES ? undefined : branchId,
        actorUserId: actorUserId === ALL_ACTORS ? undefined : actorUserId,
        customerPhone: customerPhone.trim() || undefined,
      });
      setData(res);
    } catch (e) {
      toast.error(
        e instanceof ApiError
          ? e.message
          : t('unpaidInvoices.loadError', 'Could not load unpaid invoices.'),
      );
    } finally {
      setLoading(false);
    }
  }, [token, fromDate, toDate, branchId, actorUserId, customerPhone, t]);

  useEffect(() => {
    if (!token || !canView) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canView]);

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
      rows: visibleRows,
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
    visibleRows,
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

  const cols: DataTableColumn[] = [
    { key: 'status', label: t('unpaidInvoices.col.status', 'Status') },
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
      key: 'debt',
      label: t('unpaidInvoices.col.debt', 'Outstanding'),
      align: 'end',
      numeric: true,
    },
    {
      key: 'walletDebt',
      label: t(
        'unpaidInvoices.col.currentCustomerDebt',
        'Customer current debt',
      ),
      align: 'end',
      numeric: true,
    },
  ];

  const kpis = data?.kpis;

  return (
    <div className="space-y-5">
      <PageHeader
        tone="red"
        title={
          <span className="inline-flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            {t('unpaidInvoices.title', 'Unpaid invoices list')}
          </span>
        }
        subtitle={t(
          'unpaidInvoices.subtitle',
          'Every invoice that has not been fully collected.',
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
          <div className="text-xs tabular-nums text-muted-foreground">
            {visibleRows.length} / {data?.rows.length ?? 0}
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          tone="red"
          label={t('unpaidInvoices.kpiOpenDebt', 'Open debt')}
          value={formatKwdLabel(kpis?.openDebtKd ?? '0')}
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
          empty={visibleRows.length === 0}
          emptyState={t(
            'unpaidInvoices.noInvoices',
            'No invoices match the current filters.',
          )}
          scrollClassName="max-h-[min(72vh,720px)]"
        >
          {visibleRows.map((r) => (
            <TableRow key={r.orderId}>
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
              <TableCell className="text-end font-semibold tabular-nums text-red-600 dark:text-red-400">
                {formatKwdLabel(r.debtAmountKd)}
              </TableCell>
              <TableCell className="text-end tabular-nums text-muted-foreground">
                {formatKwdLabel(r.currentCustomerDebtKd)}
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
    const n = Number.parseFloat(String(kd ?? '0'));
    if (!Number.isFinite(n)) return '0.000';
    return n.toFixed(3);
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

  const bodyRows =
    rows.length > 0
      ? rows
          .map(
            (r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(fmtDate(r.issuedAt))}</td>
        <td class="mono">${esc(r.serialNumber)}</td>
        <td>${esc(r.customerName)}</td>
        <td class="mono" dir="ltr">${esc(r.customerPhone)}</td>
        <td>${esc(r.branchName)}</td>
        <td>${esc(r.actorUserName)}</td>
        <td class="num">${money(r.invoiceTotalKd)}</td>
        <td class="num open">${money(r.debtAmountKd)}</td>
        <td class="num muted">${money(r.currentCustomerDebtKd)}</td>
      </tr>`,
          )
          .join('')
      : `<tr><td colspan="10" class="empty">${esc(t('unpaidInvoices.printNoRows', 'No rows.'))}</td></tr>`;

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
      grid-template-columns: repeat(4, minmax(0,1fr));
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
    td.open { color: var(--red); font-weight: 700; }
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
        <div class="k">${esc(t('unpaidInvoices.printOpenDebt', 'Open debt'))}</div>
        <div class="v">${money(kpis?.openDebtKd)} KD</div>
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

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>${esc(t('unpaidInvoices.col.issuedAt', 'Invoice date'))}</th>
          <th>${esc(t('unpaidInvoices.col.serial', 'Invoice #'))}</th>
          <th>${esc(t('unpaidInvoices.col.customer', 'Customer'))}</th>
          <th>${esc(t('unpaidInvoices.col.phone', 'Phone'))}</th>
          <th>${esc(t('unpaidInvoices.col.branch', 'Branch'))}</th>
          <th>${esc(t('unpaidInvoices.col.actor', 'Issuer'))}</th>
          <th class="num">${esc(t('unpaidInvoices.col.invoiceTotal', 'Invoice total'))}</th>
          <th class="num">${esc(t('unpaidInvoices.col.debt', 'Outstanding'))}</th>
          <th class="num">${esc(t('unpaidInvoices.col.currentCustomerDebt', 'Customer debt'))}</th>
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
