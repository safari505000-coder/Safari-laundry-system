import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Banknote,
  Building2,
  CalendarDays,
  Filter,
  Loader2,
  MessageCircle,
  Phone,
  Printer,
  RefreshCw,
  Search,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import { useOutstanding } from '@/modules/call-center/outstanding/hooks/use-outstanding';
import type { OutstandingRow } from '@/modules/call-center/outstanding/api/outstanding-api';
import { useCcDrivers } from '@/modules/call-center/dashboard/hooks/use-cc-drivers';
import { Button, buttonVariants } from '@/modules/shared/components/ui/button';
import { Input } from '@/modules/shared/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/shared/components/ui/select';
import { cn } from '@/lib/utils';
import {
  collectionsUnpaidWhatsAppHref,
  whatsappChatNumber,
} from '@/modules/shared/lib/whatsapp-links';
import {
  useCollectionsFilters,
  type CollectionsFilters,
} from '../hooks/use-collections-filters';
import { useUnpaidOnline } from '../hooks/use-unpaid-online';
import {
  filterUnpaidLinks,
  groupOutstandingByDriver,
  groupUnpaidByBranch,
} from '../utils/grouping';
import { DATE_PRESET_OPTIONS } from '../utils/date-presets';

const OVERDUE_DAYS = 7;

function formatKwd(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('ar-KW', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(n);
}

function formatRelativeAr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'الآن';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'أمس';
  if (days < 30) return `قبل ${days} يوم`;
  if (days < 60) return 'قبل شهر';
  return `قبل ${Math.floor(days / 30)} أشهر`;
}

function normalisePhoneForTel(phone: string): string {
  const wa = whatsappChatNumber(phone);
  return wa ?? phone.replace(/[^\d+]/g, '');
}

function KpiTile({
  label,
  value,
  caption,
  tone = 'default',
  icon: Icon,
}: {
  label: string;
  value: string;
  caption?: string;
  tone?: 'default' | 'primary' | 'danger' | 'success' | 'warning';
  icon: typeof Wallet;
}) {
  const toneClass =
    tone === 'primary'
      ? 'text-primary'
      : tone === 'danger'
        ? 'text-rose-700 dark:text-rose-300'
        : tone === 'success'
          ? 'text-emerald-700 dark:text-emerald-300'
          : tone === 'warning'
            ? 'text-amber-700 dark:text-amber-300'
            : 'text-foreground';
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="truncate">{label}</span>
        <Icon className="size-4 shrink-0 opacity-70" aria-hidden />
      </div>
      <div
        className={cn(
          'mt-2 truncate font-heading text-2xl font-semibold tabular-nums sm:text-3xl',
          toneClass,
        )}
      >
        {value}
      </div>
      {caption ? (
        <div className="mt-1 truncate text-[11px] text-muted-foreground">
          {caption}
        </div>
      ) : null}
    </div>
  );
}

/**
 * `/cc/collections-report` — لوحة التحصيل (Collections Operations Dashboard).
 *
 * Replaces the legacy "Outstanding (AR)" page. Pure UI layer — totals
 * are taken directly from `OutstandingResponse.totalDueKd` (which the
 * backend computes from `OrdersService.sumCollectionsDebtTotalKd`).
 * No `reduce()` over `rows` to recompute the canonical aggregate;
 * the only sums in this file are per-driver / per-branch derived
 * sub-views, clearly labelled as breakdowns.
 */
export function CollectionsReportPage() {
  const { t } = useTranslation();
  const filters = useCollectionsFilters();
  const outstanding = useOutstanding(filters.apiFilters);
  const drivers = useCcDrivers();
  const unpaid = useUnpaidOnline({
    branchId: filters.effective.branchId || null,
  });

  // Hard safety guard — required by the cockpit contract.
  if (
    outstanding.data &&
    typeof outstanding.data.totalDueKd !== 'string' &&
    typeof outstanding.data.totalDueKd !== 'number'
  ) {
    throw new Error('Missing financial source');
  }

  const driverAggregates = useMemo(() => {
    if (!outstanding.data) return [];
    return groupOutstandingByDriver(outstanding.data.rows, unpaid.rows);
  }, [outstanding.data, unpaid.rows]);

  const branchAggregates = useMemo(
    () => groupUnpaidByBranch(unpaid.rows),
    [unpaid.rows],
  );

  const paymentLinkRows = useMemo(
    () =>
      filterUnpaidLinks(unpaid.rows, {
        onlyWithLink: filters.effective.hasPaymentLink,
      }).slice(0, 50),
    [unpaid.rows, filters.effective.hasPaymentLink],
  );

  const refreshAll = () => {
    outstanding.refresh();
    unpaid.refresh();
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') window.print();
  };

  // Print roster: a clean per-customer list — exactly what the agent
  // needs on paper for a calling round (Name · Phone · Amount). The
  // sort matches the on-screen Priority / Outstanding ordering: highest
  // remaining first.
  const printRoster = useMemo(() => {
    if (!outstanding.data) return [];
    return [...outstanding.data.rows].sort(
      (a, b) => b.totalDueKd - a.totalDueKd,
    );
  }, [outstanding.data]);

  const printDateLabel = useMemo(() => {
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date());
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 print:max-w-none print:px-0 print:py-0 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Wallet className="size-5" aria-hidden />
          </div>
          <div>
            <h1 className="font-heading text-xl font-semibold">
              {t('collectionsReport.title', { defaultValue: 'لوحة التحصيل' })}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t('collectionsReport.subtitle', {
                defaultValue:
                  'عرض تشغيلي لحالة التحصيل — تجميع حسب السائق والفرع، ومتابعة روابط الدفع غير المحصّلة.',
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePrint}
            disabled={!outstanding.data || printRoster.length === 0}
            aria-label="طباعة قائمة العملاء"
          >
            <Printer className="size-4" aria-hidden />
            طباعة
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={outstanding.refreshing || unpaid.loading}
          >
            {outstanding.refreshing || unpaid.loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-4" aria-hidden />
            )}
            {t('common.refresh', { defaultValue: 'تحديث' })}
          </Button>
        </div>
      </header>

      {/* Print-only roster: hidden on screen, the only thing printed. */}
      <PrintRoster
        rows={printRoster}
        totalDueKd={outstanding.data ? String(outstanding.data.totalDueKd) : '—'}
        totalCustomers={outstanding.data?.totalCustomers ?? 0}
        generatedAt={printDateLabel}
      />

      <FiltersBar
        filters={filters}
        drivers={drivers.drivers.map((d) => ({ id: d.id, name: d.name }))}
        branchOptions={branchAggregates.map((b) => ({
          id: b.branchName,
          name: b.branchName,
        }))}
      />

      <section
        className="grid grid-cols-2 gap-3 print:hidden sm:grid-cols-4"
        aria-label="kpi"
      >
        <KpiTile
          label="إجمالي المديونية (د.ك)"
          value={outstanding.data ? formatKwd(outstanding.data.totalDueKd) : '—'}
          caption={
            outstanding.data
              ? `المصدر: ${outstanding.data.source}`
              : 'في انتظار البيانات…'
          }
          tone="danger"
          icon={Wallet}
        />
        <KpiTile
          label="عدد العملاء"
          value={outstanding.data ? String(outstanding.data.totalCustomers) : '—'}
          caption={
            outstanding.data
              ? `محظورون: ${outstanding.data.blockedCount} · حرجون: ${outstanding.data.riskCount}`
              : undefined
          }
          tone="primary"
          icon={Users}
        />
        <KpiTile
          label="فواتير مفتوحة"
          value={outstanding.data ? String(outstanding.data.totalInvoices) : '—'}
          caption={
            outstanding.data
              ? `متأخّرون: ${outstanding.data.lateCount}`
              : undefined
          }
          tone="warning"
          icon={Banknote}
        />
        <KpiTile
          label="روابط دفع متابعة"
          value={String(paymentLinkRows.length)}
          caption={`من ${unpaid.rows.length} فاتورة عبر القنوات الإلكترونية`}
          tone="success"
          icon={MessageCircle}
        />
      </section>

      {outstanding.error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive print:hidden">
          {outstanding.error}
        </div>
      ) : null}

      <div className="contents print:hidden">
        <DriversTable
          rows={driverAggregates}
          loading={outstanding.loading && !outstanding.data}
        />

        <BranchTable
          rows={branchAggregates}
          loading={unpaid.loading && unpaid.rows.length === 0}
        />

        <PaymentLinksTable
          rows={paymentLinkRows}
          loading={unpaid.loading && unpaid.rows.length === 0}
        />
      </div>
    </div>
  );
}

/**
 * Hidden on screen, visible only when the agent fires the browser
 * print dialog. Renders the call-roster the field team actually
 * carries to the round: Customer · Phone · Outstanding (د.ك). Sorted
 * by remaining (highest first) to mirror the on-screen Priority view.
 */
function PrintRoster({
  rows,
  totalDueKd,
  totalCustomers,
  generatedAt,
}: {
  rows: ReadonlyArray<OutstandingRow>;
  totalDueKd: string;
  totalCustomers: number;
  generatedAt: string;
}) {
  return (
    <div className="hidden print:block print:p-6 print:text-black">
      <header className="mb-4 flex items-baseline justify-between border-b border-black pb-2">
        <div>
          <h1 className="text-xl font-bold">قائمة التحصيل</h1>
          <p className="text-xs">طُبعت في: {generatedAt}</p>
        </div>
        <div className="text-end text-xs">
          <div>عدد العملاء: <span className="font-semibold">{totalCustomers}</span></div>
          <div>إجمالي المستحق: <span className="font-semibold">{formatKwd(totalDueKd)} د.ك</span></div>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm">لا توجد بيانات للطباعة.</p>
      ) : (
        <table className="w-full border-collapse text-sm" style={{ direction: 'rtl' }}>
          <thead>
            <tr className="border-b-2 border-black">
              <th className="p-2 text-start" style={{ width: '6%' }}>#</th>
              <th className="p-2 text-start" style={{ width: '38%' }}>اسم العميل</th>
              <th className="p-2 text-start" style={{ width: '22%' }}>رقم الهاتف</th>
              <th className="p-2 text-end" style={{ width: '18%' }}>المبلغ (د.ك)</th>
              <th className="p-2 text-start" style={{ width: '16%' }}>ملاحظة المتّصل</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.customerId} className="border-b border-gray-300">
                <td className="p-2 tabular-nums">{idx + 1}</td>
                <td className="p-2 font-medium">{row.name ?? row.phone}</td>
                <td className="p-2 tabular-nums" dir="ltr">
                  {row.phone}
                  {row.phone2 ? ` · ${row.phone2}` : ''}
                </td>
                <td className="p-2 text-end font-semibold tabular-nums">
                  {formatKwd(row.totalDueKd)}
                </td>
                <td className="p-2">&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <footer className="mt-6 text-[10px] text-gray-700">
        المصدر: لوحة التحصيل — Safari Omni · القيم مأخوذة كما هي من الباك‑إند ولم يجرِ أي حساب على الواجهة.
      </footer>
    </div>
  );
}

function FiltersBar({
  filters,
  drivers,
  branchOptions,
}: {
  filters: ReturnType<typeof useCollectionsFilters>;
  drivers: { id: string; name: string }[];
  branchOptions: { id: string; name: string }[];
}) {
  const { filters: live } = filters;
  return (
    <section
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm print:hidden"
      aria-label="filters"
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Filter className="size-4" aria-hidden />
        المرشّحات
      </div>

      <div className="flex flex-wrap gap-1">
        {DATE_PRESET_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => filters.setPreset(opt.id)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              live.preset === opt.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:bg-muted',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {live.preset === 'CUSTOM' ? (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">من تاريخ</label>
              <Input
                type="date"
                value={live.custom.from}
                onChange={(e) =>
                  filters.setCustomRange({
                    from: e.target.value,
                    to: live.custom.to,
                  })
                }
                className="h-9"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">إلى تاريخ</label>
              <Input
                type="date"
                value={live.custom.to}
                onChange={(e) =>
                  filters.setCustomRange({
                    from: live.custom.from,
                    to: e.target.value,
                  })
                }
                className="h-9"
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">الفترة</label>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" aria-hidden />
              <span>
                {DATE_PRESET_OPTIONS.find((o) => o.id === live.preset)?.label ??
                  '—'}
              </span>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">السائق</label>
          <Select
            value={live.driverId || 'ALL'}
            onValueChange={(v) =>
              filters.setDriverId(!v || v === 'ALL' ? '' : String(v))
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="كل السائقين" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">كل السائقين</SelectItem>
              {drivers.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">الفرع</label>
          <Select
            value={live.branchId || 'ALL'}
            onValueChange={(v) =>
              filters.setBranchId(!v || v === 'ALL' ? '' : String(v))
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="كل الفروع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">كل الفروع</SelectItem>
              {branchOptions.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">رابط الدفع</label>
          <button
            type="button"
            onClick={() => filters.setHasPaymentLink(!live.hasPaymentLink)}
            className={cn(
              'inline-flex h-9 items-center justify-between rounded-lg border px-3 text-xs font-medium transition-colors',
              live.hasPaymentLink
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-background text-muted-foreground',
            )}
          >
            <span>{live.hasPaymentLink ? 'يحوي رابط دفع فقط' : 'الكل'}</span>
            <MessageCircle className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}

function DriversTable({
  rows,
  loading,
}: {
  rows: ReturnType<typeof groupOutstandingByDriver>;
  loading: boolean;
}) {
  return (
    <section
      className="rounded-2xl border border-border bg-card p-4 shadow-sm"
      aria-label="drivers-summary"
    >
      <header className="mb-3 flex items-center gap-2">
        <Truck className="size-4 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold">حسب السائق</h2>
        <span className="ms-auto text-[11px] text-muted-foreground">
          تجميع للعرض فقط · المجموع الإجمالي يبقى من الباك‑إند
        </span>
      </header>

      {loading ? (
        <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" aria-hidden />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background/60 p-6 text-center text-sm text-muted-foreground">
          لا يوجد سائقون لديهم مديونية في هذا النطاق.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-2 text-start">السائق</th>
                <th className="p-2 text-end">عملاء</th>
                <th className="p-2 text-end">فواتير</th>
                <th className="p-2 text-end">المتبقّي (د.ك)</th>
                <th className="p-2 text-end">روابط دفع</th>
                <th className="p-2 text-end">أقصى تأخير</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, idx) => {
                const overdue = row.maxDaysLate >= OVERDUE_DAYS;
                return (
                  <tr
                    key={(row.driverId ?? row.driverName) + ':' + idx}
                    className={cn(
                      'bg-card hover:bg-muted/40',
                      overdue && 'bg-amber-50/40 dark:bg-amber-950/20',
                    )}
                  >
                    <td className="p-2 font-medium">{row.driverName}</td>
                    <td className="p-2 text-end tabular-nums">
                      {row.customers}
                    </td>
                    <td className="p-2 text-end tabular-nums">
                      {row.invoices}
                    </td>
                    <td className="p-2 text-end tabular-nums font-semibold text-rose-700 dark:text-rose-300">
                      {formatKwd(row.totalRemainingKd)}
                    </td>
                    <td className="p-2 text-end tabular-nums">
                      {row.unpaidLinks}
                    </td>
                    <td className="p-2 text-end tabular-nums">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
                          overdue
                            ? 'border-amber-300 bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100'
                            : 'border-border bg-background text-muted-foreground',
                        )}
                      >
                        {overdue ? (
                          <AlertTriangle className="size-3" aria-hidden />
                        ) : null}
                        {row.maxDaysLate} يوم
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function BranchTable({
  rows,
  loading,
}: {
  rows: ReturnType<typeof groupUnpaidByBranch>;
  loading: boolean;
}) {
  return (
    <section
      className="rounded-2xl border border-border bg-card p-4 shadow-sm"
      aria-label="branches-summary"
    >
      <header className="mb-3 flex items-center gap-2">
        <Building2 className="size-4 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold">حسب الفرع</h2>
        <span className="ms-auto text-[11px] text-muted-foreground">
          مبني على الفواتير المفتوحة عبر قنوات الدفع
        </span>
      </header>

      {loading ? (
        <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" aria-hidden />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background/60 p-6 text-center text-sm text-muted-foreground">
          لا توجد بيانات فروع متاحة.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-2 text-start">الفرع</th>
                <th className="p-2 text-end">فواتير</th>
                <th className="p-2 text-end">المتبقّي (د.ك)</th>
                <th className="p-2 text-end">عدد السائقين</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.branchName} className="bg-card hover:bg-muted/40">
                  <td className="p-2 font-medium">{row.branchName}</td>
                  <td className="p-2 text-end tabular-nums">{row.invoices}</td>
                  <td className="p-2 text-end tabular-nums font-semibold text-rose-700 dark:text-rose-300">
                    {formatKwd(row.totalRemainingKd)}
                  </td>
                  <td className="p-2 text-end tabular-nums">
                    {row.driversCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PaymentLinksTable({
  rows,
  loading,
}: {
  rows: ReturnType<typeof filterUnpaidLinks>;
  loading: boolean;
}) {
  return (
    <section
      className="rounded-2xl border border-border bg-card p-4 shadow-sm"
      aria-label="payment-links"
    >
      <header className="mb-3 flex items-center gap-2">
        <MessageCircle className="size-4 text-emerald-600" aria-hidden />
        <h2 className="text-sm font-semibold">روابط الدفع غير المحصّلة</h2>
        <span className="ms-auto text-[11px] text-muted-foreground">
          أزرار الإجراءات تستخدم نفس قنوات WhatsApp و الاتصال الحالية
        </span>
      </header>

      {loading ? (
        <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" aria-hidden />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background/60 p-6 text-center text-sm text-muted-foreground">
          لا توجد فواتير مفتوحة بقناة دفع إلكترونية.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-2 text-start">العميل</th>
                <th className="p-2 text-start">الهاتف</th>
                <th className="p-2 text-start">الفاتورة</th>
                <th className="p-2 text-end">المبلغ (د.ك)</th>
                <th className="p-2 text-end">آخر تذكير</th>
                <th className="p-2 text-end">العمر</th>
                <th className="p-2 text-end">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const overdue = row.invoiceAgeDays >= OVERDUE_DAYS;
                const tel = `tel:${normalisePhoneForTel(row.customerPhone)}`;
                const wa = collectionsUnpaidWhatsAppHref(row);
                const fallbackWa = wa
                  ? null
                  : `https://wa.me/${whatsappChatNumber(row.customerPhone) ?? ''}`;
                return (
                  <tr
                    key={row.orderId}
                    className={cn(
                      'bg-card hover:bg-muted/40',
                      overdue && 'bg-amber-50/40 dark:bg-amber-950/20',
                    )}
                  >
                    <td className="p-2 font-medium">{row.customerName}</td>
                    <td className="p-2" dir="ltr">{row.customerPhone}</td>
                    <td className="p-2">
                      <div className="flex flex-col">
                        <span className="font-medium">{row.readableId}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {row.branchName ?? '—'} · {row.driverName ?? '—'}
                        </span>
                      </div>
                    </td>
                    <td className="p-2 text-end tabular-nums font-semibold text-rose-700 dark:text-rose-300">
                      {formatKwd(row.amountKd)}
                    </td>
                    <td className="p-2 text-end text-[11px] text-muted-foreground">
                      {formatRelativeAr(row.lastReminderAtIso)}
                      {row.reminderCount > 0 ? (
                        <div className="text-[10px] text-muted-foreground/80">
                          {row.reminderCount} تذكير
                        </div>
                      ) : null}
                    </td>
                    <td className="p-2 text-end tabular-nums">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
                          overdue
                            ? 'border-amber-300 bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100'
                            : 'border-border bg-background text-muted-foreground',
                        )}
                      >
                        {overdue ? (
                          <AlertTriangle className="size-3" aria-hidden />
                        ) : null}
                        {row.invoiceAgeDays} يوم
                      </span>
                    </td>
                    <td className="p-2 text-end">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1">
                        <a
                          href={tel}
                          className={cn(
                            buttonVariants({ variant: 'outline', size: 'sm' }),
                            'h-7 px-2 text-xs',
                          )}
                          aria-label="اتصال"
                        >
                          <Phone className="size-3.5" aria-hidden />
                          اتصال
                        </a>
                        {wa || fallbackWa ? (
                          <a
                            href={wa ?? fallbackWa ?? '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              buttonVariants({
                                variant: 'outline',
                                size: 'sm',
                              }),
                              'h-7 px-2 text-xs',
                            )}
                            aria-label="إعادة إرسال رابط الدفع"
                          >
                            <Search className="size-3.5" aria-hidden />
                            إعادة الإرسال
                          </a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export type { CollectionsFilters };
