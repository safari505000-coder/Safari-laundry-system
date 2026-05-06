import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Loader2,
  MessageCircle,
  Phone,
  PhoneCall,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { Button, buttonVariants } from '@/modules/shared/components/ui/button';
import { Input } from '@/modules/shared/components/ui/input';
import { cn } from '@/lib/utils';
import type {
  CustomerCollectionStatusKind,
  OutstandingResponse,
  OutstandingRow,
} from '@/modules/call-center/outstanding/api/outstanding-api';

type Props = {
  outstanding: OutstandingResponse | null;
  loading: boolean;
  onOpenCustomer: (row: OutstandingRow) => void;
};

type RiskFilter = 'ALL' | CustomerCollectionStatusKind;

const RISK_OPTIONS: { id: RiskFilter; label: string }[] = [
  { id: 'ALL', label: 'الكل' },
  { id: 'RISK', label: 'حرج' },
  { id: 'LATE', label: 'متأخّر' },
  { id: 'NORMAL', label: 'طبيعي' },
];

const PAGE_SIZE = 10;

function formatKwd(value: number): string {
  if (!Number.isFinite(value)) return '0.000';
  return new Intl.NumberFormat('ar-KW', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(value);
}

function formatLastOrder(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return 'اليوم';
  if (days === 1) return 'أمس';
  if (days < 30) return `قبل ${days} يوم`;
  if (days < 60) return 'قبل شهر';
  return `قبل ${Math.floor(days / 30)} أشهر`;
}

function statusBadgeClass(s: CustomerCollectionStatusKind, blocked: boolean) {
  if (blocked) {
    return 'bg-foreground/10 text-foreground border-foreground/40';
  }
  if (s === 'RISK') {
    return 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-900/30 dark:text-rose-100';
  }
  if (s === 'LATE') {
    return 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/30 dark:text-amber-100';
  }
  return 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-100';
}

function riskLabel(s: CustomerCollectionStatusKind, blocked: boolean) {
  if (blocked) return 'محظور';
  if (s === 'RISK') return 'HIGH';
  if (s === 'LATE') return 'MEDIUM';
  return 'LOW';
}

function normalisePhoneForLink(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits.slice(1);
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('965')) return digits;
  if (digits.startsWith('0')) return `965${digits.slice(1)}`;
  if (digits.length === 8) return `965${digits}`;
  return digits;
}

/**
 * Priority Call Queue — already sorted server-side by `priorityScore`
 * (highest debt + oldest invoice + recent inactivity in the
 * collections engine). The cockpit only filters/searches client-side
 * and renders the rows; it never re-sums money.
 */
export function CallQueue({ outstanding, loading, onOpenCustomer }: Props) {
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('ALL');
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  const rowsAll = outstanding?.rows ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rowsAll.filter((r) => {
      if (riskFilter !== 'ALL' && r.status !== riskFilter) return false;
      if (q.length > 0) {
        const hay = [r.name ?? '', r.phone, r.phone2 ?? '']
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rowsAll, riskFilter, search]);

  const visible = useMemo(
    () => (showAll ? filtered : filtered.slice(0, PAGE_SIZE)),
    [filtered, showAll],
  );

  return (
    <section
      className="rounded-2xl border border-border bg-card p-4 shadow-sm"
      aria-label="قائمة الأولوية للاتصال"
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PhoneCall className="size-4 text-primary" aria-hidden />
          <h2 className="text-sm font-semibold">قائمة الأولويّة للاتصال</h2>
          {outstanding ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {filtered.length} من {rowsAll.length}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <SlidersHorizontal className="size-3.5" aria-hidden />
          مرتّبة حسب الأولويّة (مديونيّة أعلى → فاتورة أقدم)
        </div>
      </header>

      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground ltr:left-3 rtl:right-3"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو رقم الهاتف…"
            className="h-9 ltr:pl-9 rtl:pr-9"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {RISK_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setRiskFilter(opt.id)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                riskFilter === opt.id
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !outstanding ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          تحميل قائمة الأولويّة…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background/60 p-6 text-center text-sm text-muted-foreground">
          لا توجد عناصر تطابق هذا المرشح.
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
          {visible.map((row) => {
            const phoneLink = `tel:${normalisePhoneForLink(row.phone)}`;
            const waLink = `https://wa.me/${normalisePhoneForLink(row.phone)}`;
            return (
              <li
                key={row.customerId}
                className="flex flex-wrap items-center gap-3 bg-card px-3 py-3 sm:flex-nowrap"
              >
                <button
                  type="button"
                  onClick={() => onOpenCustomer(row)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-start"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                    {(row.name ?? row.phone).slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {row.name ?? row.phone}
                      </p>
                      <span
                        className={cn(
                          'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          statusBadgeClass(row.status, row.blocked),
                        )}
                      >
                        {riskLabel(row.status, row.blocked)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span dir="ltr" className="flex items-center gap-1">
                        <Phone className="size-3" aria-hidden /> {row.phone}
                      </span>
                      <span>
                        فواتير: {row.invoicesCount}
                      </span>
                      <span>
                        تأخّر: {row.daysLate} يوم
                      </span>
                      <span>
                        آخر عمليّة: {formatLastOrder(row.lastOrderAt)}
                      </span>
                    </div>
                  </div>
                </button>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-heading text-base font-semibold tabular-nums text-rose-700 dark:text-rose-300">
                    {formatKwd(row.totalDueKd)} د.ك
                  </span>
                  <div className="flex items-center gap-1">
                    <a
                      href={phoneLink}
                      aria-label={`اتصل بـ ${row.name ?? row.phone}`}
                      className={cn(
                        buttonVariants({ variant: 'outline', size: 'sm' }),
                        'h-7 px-2 text-xs',
                      )}
                    >
                      <Phone className="size-3.5" aria-hidden />
                      اتصال
                    </a>
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="فتح واتساب"
                      className={cn(
                        buttonVariants({ variant: 'outline', size: 'sm' }),
                        'h-7 px-2 text-xs',
                      )}
                    >
                      <MessageCircle className="size-3.5" aria-hidden />
                      واتساب
                    </a>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onOpenCustomer(row)}
                      className="h-7 px-2 text-xs"
                    >
                      <ArrowUpRight className="size-3.5" aria-hidden />
                      التفاصيل
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {filtered.length > PAGE_SIZE ? (
        <div className="mt-3 flex justify-center">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll
              ? 'عرض أقل'
              : `عرض الكل (${filtered.length})`}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
