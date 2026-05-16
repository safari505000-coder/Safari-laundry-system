import { useCallback, useState } from 'react';
import { Loader2, Phone, Printer, RefreshCw, Search } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { apiJson } from '@/lib/api';
import { formatKwdAmount, formatKwdLabel } from '@/lib/kwd';
import {
  useCcCustomerSearch,
  type CustomerSearchHit,
} from '@/modules/call-center/dashboard/hooks/use-cc-customer-search';
import { Button } from '@/modules/shared/components/ui/button';
import { Input } from '@/modules/shared/components/ui/input';
import { PageHeader } from '@/modules/shared/components/page';
import {
  FullJournalEntriesPanel,
  type FullJournalEntry,
} from '@/modules/finance/components/FullJournalEntriesPanel';

// ─── وسائل الدفع ───────────────────────────────────────────────────────────

type PaymentMethodKey =
  | 'CASH'
  | 'KNET'
  | 'ONLINE'
  | 'PAYMENT_LINK'
  | 'SUBSCRIPTION_WALLET'
  | 'DEBT_ON_ACCOUNT';

const ALL_METHODS: { key: PaymentMethodKey; label: string }[] = [
  { key: 'CASH', label: 'نقدي' },
  { key: 'KNET', label: 'كي-نت' },
  { key: 'ONLINE', label: 'أونلاين' },
  { key: 'PAYMENT_LINK', label: 'رابط دفع' },
  { key: 'SUBSCRIPTION_WALLET', label: 'محفظة / اشتراك' },
  { key: 'DEBT_ON_ACCOUNT', label: 'على الحساب (ذمم)' },
];

/**
 * يستنتج وسيلة الدفع من أكواد الحسابات في أسطر القيد.
 * 1100 نقدي — 1200 كي‌نت — 1210 أونلاين/رابط — 2100 محفظة — بدون إيداع = ذمم.
 */
function inferMethodsFromEntry(entry: FullJournalEntry): Set<PaymentMethodKey> {
  const codes = new Set(entry.lines.map((l) => l.accountCode));
  const methods = new Set<PaymentMethodKey>();
  if (codes.has('1100')) methods.add('CASH');
  if (codes.has('1200')) methods.add('KNET');
  if (codes.has('1210')) {
    methods.add('ONLINE');
    methods.add('PAYMENT_LINK');
  }
  if (codes.has('2100')) methods.add('SUBSCRIPTION_WALLET');
  const hasPayIn = codes.has('1100') || codes.has('1200') || codes.has('1210');
  const hasWallet = codes.has('2100');
  if (!hasPayIn && !hasWallet) methods.add('DEBT_ON_ACCOUNT');
  return methods;
}

// ─── نوع البيانات من الـ API ────────────────────────────────────────────────

type FullEntriesResponse = {
  customerId: string;
  entries: FullJournalEntry[];
};

// ─── الصفحة الرئيسية ────────────────────────────────────────────────────────

export function AccountantDoubleEntryJournalPage() {
  const { token } = useAuth();

  const [customerId, setCustomerId] = useState('');
  const [query, setQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerSearchHit | null>(null);

  const [selectedMethods, setSelectedMethods] = useState<
    Set<PaymentMethodKey>
  >(new Set(ALL_METHODS.map((m) => m.key)));

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [allEntries, setAllEntries] = useState<FullJournalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customerSearch = useCcCustomerSearch(query);

  // ── جلب البيانات من الخادم ─────────────────────────────────────────────
  const loadEntries = useCallback(
    async (nextCustomerId?: string) => {
      const cid = (nextCustomerId ?? customerId).trim();
      if (!cid || !token) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (dateFrom) params.set('dateFrom', new Date(dateFrom).toISOString());
        if (dateTo) {
          const end = new Date(dateTo);
          end.setHours(23, 59, 59, 999);
          params.set('dateTo', end.toISOString());
        }
        const qs = params.toString();
        const url = `/api/finance/journal/customers/${cid}/full-entries${qs ? `?${qs}` : ''}`;
        const res = await apiJson<FullEntriesResponse>(url, { token });
        setAllEntries(res.entries ?? []);
      } catch {
        setError('تعذر تحميل القيود. تحقق من الاتصال ثم أعد المحاولة.');
      } finally {
        setLoading(false);
      }
    },
    [customerId, token, dateFrom, dateTo],
  );

  const handleSelectCustomer = useCallback(
    (hit: CustomerSearchHit) => {
      setSelectedCustomer(hit);
      setCustomerId(hit.id);
      setQuery(hit.phone);
      void loadEntries(hit.id);
    },
    [loadEntries],
  );

  const toggleMethod = (key: PaymentMethodKey) => {
    setSelectedMethods((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedMethods((prev) =>
      prev.size === ALL_METHODS.length
        ? new Set()
        : new Set(ALL_METHODS.map((m) => m.key)),
    );
  };

  // ── فلترة القيود حسب وسيلة الدفع ─────────────────────────────────────────
  const filteredEntries =
    selectedMethods.size === ALL_METHODS.length
      ? allEntries
      : allEntries.filter((entry) => {
          const methods = inferMethodsFromEntry(entry);
          return [...methods].some((m) => selectedMethods.has(m));
        });

  return (
    <section className="space-y-5">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #journal-double-entry-print,
          #journal-double-entry-print * { visibility: visible; }
          #journal-double-entry-print {
            position: absolute; inset: 0; width: 100%;
            padding: 24px; background: white; color: black;
          }
        }
      `}</style>

      <PageHeader
        title="كشف القيد المزدوج"
        subtitle="نواة البنكية — قيد مزدوج متوازن لكل عميل مع تفصيل الحسابات وتحقق Σ مدين = Σ دائن."
      />

      {/* ── بطاقة الفلاتر ── */}
      <div className="rounded-xl border bg-card p-4 shadow-sm print:hidden space-y-4">

        {/* بحث العميل */}
        <label className="space-y-2 text-sm font-medium block">
          بحث بالعميل (رقم التلفون)
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedCustomer(null);
                setAllEntries([]);
              }}
              placeholder="مثال: 50001234"
              inputMode="tel"
              dir="ltr"
              className="pe-9 text-end tabular-nums"
            />
          </div>
        </label>

        {customerSearch.loading ? (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري البحث...
          </div>
        ) : customerSearch.hits.length > 0 && !selectedCustomer ? (
          <div className="overflow-hidden rounded-xl border bg-background">
            {customerSearch.hits.map((hit) => (
              <button
                key={hit.id}
                type="button"
                onClick={() => handleSelectCustomer(hit)}
                className="flex w-full items-center justify-between gap-3 border-b px-4 py-3 text-start transition hover:bg-muted/60 last:border-b-0"
              >
                <span>
                  <span className="block font-medium">
                    {hit.displayName || 'عميل بدون اسم'}
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    <span dir="ltr">{hit.phone}</span>
                  </span>
                </span>
                <span className="text-sm font-semibold text-destructive">
                  {formatKwdLabel(hit.totalDebtKd)}
                </span>
              </button>
            ))}
          </div>
        ) : customerSearch.isEmptyAllowedQuery && !selectedCustomer ? (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            لا يوجد عميل مطابق.
          </div>
        ) : null}

        {selectedCustomer ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
            العميل المختار: {selectedCustomer.displayName} —{' '}
            <span dir="ltr">{selectedCustomer.phone}</span>
          </div>
        ) : null}

        {/* فلتر التاريخ */}
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium">من تاريخ</span>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              dir="ltr"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">إلى تاريخ</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              dir="ltr"
            />
          </label>
        </div>

        {/* فلتر وسائل الدفع */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">وسائل الدفع</span>
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs text-primary hover:underline"
            >
              {selectedMethods.size === ALL_METHODS.length
                ? 'إلغاء الكل'
                : 'تحديد الكل'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {ALL_METHODS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleMethod(key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  selectedMethods.has(key)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* أزرار التحميل والطباعة */}
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => void loadEntries()}
            disabled={loading || !customerId.trim()}
          >
            {loading ? (
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="me-2 h-4 w-4" />
            )}
            تحميل القيود
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => window.print()}
            disabled={filteredEntries.length === 0}
          >
            <Printer className="me-2 h-4 w-4" />
            طباعة
          </Button>
        </div>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
        {customerSearch.error ? (
          <p className="text-sm text-destructive">{customerSearch.error}</p>
        ) : null}
      </div>

      {/* ── ملخص للطباعة ── */}
      <div id="journal-double-entry-print" className="space-y-4">
        <div className="hidden border-b pb-4 print:block">
          <h1 className="text-2xl font-bold">كشف القيد المزدوج — نواة البنكية</h1>
          <p className="mt-1 text-sm">
            العميل:{' '}
            {selectedCustomer
              ? `${selectedCustomer.displayName} / ${selectedCustomer.phone}`
              : customerId || '—'}
          </p>
          {(dateFrom || dateTo) ? (
            <p className="text-sm">
              الفترة: {dateFrom || 'البداية'} → {dateTo || 'اليوم'}
            </p>
          ) : null}
          <p className="text-sm">
            وسائل الدفع المختارة:{' '}
            {ALL_METHODS.filter((m) => selectedMethods.has(m.key))
              .map((m) => m.label)
              .join(' · ') || 'لا شيء'}
          </p>
          <p className="text-sm">
            تاريخ الطباعة: {new Date().toLocaleString('ar-KW')}
          </p>
        </div>

        {/* ملخص الأرقام */}
        {filteredEntries.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-3 print:hidden">
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <p className="text-sm text-muted-foreground">إجمالي القيود</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {filteredEntries.length}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <p className="text-sm text-muted-foreground">إجمالي المدين (د.ك)</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {formatKwdAmount(
                  filteredEntries
                    .reduce(
                      (sum, e) =>
                        sum + parseFloat(e.totalDebitKd || '0'),
                      0,
                    )
                    .toFixed(4),
                )}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <p className="text-sm text-muted-foreground">قيود غير متوازنة</p>
              <p
                className={`mt-1 text-2xl font-bold tabular-nums ${
                  filteredEntries.filter((e) => !e.balanced).length > 0
                    ? 'text-destructive'
                    : 'text-emerald-600'
                }`}
              >
                {filteredEntries.filter((e) => !e.balanced).length}
              </p>
            </div>
          </div>
        ) : null}

        {/* لوحة القيود الكاملة */}
        <FullJournalEntriesPanel
          entries={filteredEntries}
          loading={loading}
        />
      </div>
    </section>
  );
}
