import { useCallback, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, Phone, Printer, RefreshCw, Search } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { apiJson } from '@/lib/api';
import {
  formatArCustomerBalanceSummaryLine,
  formatArCustomerBalanceWithSide,
  formatKwdAmount,
  formatKwdLabel,
  isZeroKd,
} from '@/lib/kwd';
import {
  useCcCustomerSearch,
  type CustomerSearchHit,
} from '@/modules/call-center/dashboard/hooks/use-cc-customer-search';
import { Button } from '@/modules/shared/components/ui/button';
import { Input } from '@/modules/shared/components/ui/input';
import {
  DataTableShell,
  PageHeader,
  type DataTableColumn,
} from '@/modules/shared/components/page';
import { TableCell, TableRow } from '@/modules/shared/components/ui/table';

/**
 * V25 — كشف موحّد لمركز الاتصال: جدول ذمم العميل الواحد مع بيان عربي
 * وسطر سياق (باقة + دفع) من الخادم. بدون لوحة القيد المزدوج الكامل —
 * الصفحة مقصورة على أدوار CC في الـ API.
 */

type BankStatementRow = {
  entryId: string;
  date: string;
  description: string;
  contextLabel?: string;
  customerPaidKd: string;
  companySupportKd: string;
  debtGoodwillDiscountKd: string;
  walletCreditKd: string;
  walletDebitKd: string;
  arDebitKd: string;
  arCreditKd: string;
  arBalanceKd: string;
};

type BankStatementResponse = {
  balance: string;
  rows: BankStatementRow[];
};

function bankCellKd(s: string): string {
  return isZeroKd(s) ? '—' : formatKwdAmount(s);
}

const ENABLED =
  (import.meta.env.VITE_ENABLE_JOURNAL_STATEMENT ?? 'true').toLowerCase() !==
  'false';

const columns: DataTableColumn[] = [
  { key: 'date', label: 'التاريخ' },
  { key: 'description', label: 'البيان' },
  { key: 'customerPaidKd', label: 'دفع عميل' },
  { key: 'companySupportKd', label: 'دعم شركة' },
  { key: 'debtGoodwillDiscountKd', label: 'خصم ذمم حسنة' },
  { key: 'walletCreditKd', label: 'إضافة محفظة' },
  { key: 'walletDebitKd', label: 'خصم محفظة' },
  { key: 'arDebitKd', label: 'مدين ذمم' },
  { key: 'arCreditKd', label: 'دائن ذمم' },
  { key: 'arBalanceKd', label: 'صافي الرصيد' },
];

export function CustomerStatementJournalPage() {
  const { token } = useAuth();
  const [customerId, setCustomerId] = useState('');
  const [query, setQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerSearchHit | null>(null);
  const [data, setData] = useState<BankStatementResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const customerSearch = useCcCustomerSearch(query);

  const loadStatement = useCallback(
    async (nextCustomerId?: string) => {
      const trimmed = (nextCustomerId ?? customerId).trim();
      if (!trimmed || !token) return;
      setLoading(true);
      setError(null);
      try {
        const statement = await apiJson<BankStatementResponse>(
          `/api/finance/journal/customers/${trimmed}/call-center-bank-statement`,
          { token },
        );
        setData(statement);
      } catch {
        setError(
          'تعذر تحميل التقرير. تحقق من اتصال قاعدة البيانات ثم حاول مرة أخرى.',
        );
      } finally {
        setLoading(false);
      }
    },
    [customerId, token],
  );

  const handleSelectCustomer = useCallback(
    (hit: CustomerSearchHit) => {
      setSelectedCustomer(hit);
      setCustomerId(hit.id);
      setQuery(hit.phone);
      void loadStatement(hit.id);
    },
    [loadStatement],
  );

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (!ENABLED) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <section className="space-y-4">
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #journal-statement-print,
          #journal-statement-print * {
            visibility: visible;
          }
          #journal-statement-print {
            position: absolute;
            inset: 0;
            width: 100%;
            padding: 24px;
            background: white;
            color: black;
          }
        }
      `}</style>
      <PageHeader
        title="كشف ذمم العميل"
        subtitle="كشف بنكي لمركز الاتصال — دفع العميل، دعم الشركة، حركة المحفظة، وذمم متتابعة مع الباقة ووسيلة الدفع عند توفرها."
      />

      <div className="rounded-xl border bg-card p-4 shadow-sm print:hidden">
        <div className="space-y-3">
          <label className="space-y-2 text-sm font-medium">
            بحث ذكي برقم التلفون
            <div className="relative">
              <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedCustomer(null);
                  setData(null);
                }}
                placeholder="مثال: 50001234 أو 96550001234"
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
                      <span dir="ltr">
                        {hit.phone}
                        {hit.phone2 ? ` / ${hit.phone2}` : ''}
                      </span>
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
              لا يوجد عميل مطابق لهذا الرقم.
            </div>
          ) : null}

          {selectedCustomer ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
              العميل المختار: {selectedCustomer.displayName} -{' '}
              <span dir="ltr">{selectedCustomer.phone}</span>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <Button
              onClick={() => void loadStatement()}
              disabled={loading || !customerId.trim()}
            >
              {loading ? (
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="me-2 h-4 w-4" />
              )}
              تحميل الكشف
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handlePrint}
              disabled={!data || data.rows.length === 0}
            >
              <Printer className="me-2 h-4 w-4" />
              طباعة
            </Button>
          </div>
        </div>
        {customerSearch.error ? (
          <p className="mt-3 text-sm text-destructive">
            {customerSearch.error}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm text-destructive">{error}</p>
        ) : null}
      </div>

      <div id="journal-statement-print" className="space-y-4">
        <div className="hidden border-b pb-4 print:block">
          <h1 className="text-2xl font-bold">كشف ذمم العميل</h1>
          <p className="mt-1 text-sm">
            العميل:{' '}
            {selectedCustomer
              ? `${selectedCustomer.displayName} / ${selectedCustomer.phone}`
              : customerId || '-'}
          </p>
          <p className="text-sm">
            تاريخ الطباعة: {new Date().toLocaleString('ar-KW')}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <h2 className="text-base font-semibold">المصدر</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              دفتر اليومية — صف لكل قيد كامل (دفع، دعم، محفظة، ذمم) بترتيب زمني.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <h2 className="text-base font-semibold">صافي رصيد الذمم</h2>
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {formatArCustomerBalanceSummaryLine(data?.balance ?? '0')}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              مدين = على العميل ذمم؛ دائن = لصالح العميل؛ متوازن = صفر.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold">كشف الحركات</h3>
            <span className="text-xs text-muted-foreground">
              الأرقام من الخادم؛ المبالغ الصفرية تُعرض كشرطة (—). عمود الصافي:
              المبلغ المطلق + مدين / دائن / متوازن حسب تراكم الذمم.
            </span>
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <DataTableShell
              columns={columns}
              empty={(data?.rows.length ?? 0) === 0}
              emptyState="لا توجد حركات لهذا العميل."
            >
              {(data?.rows ?? []).map((row) => (
                <TableRow key={row.entryId}>
                  <TableCell className="whitespace-nowrap">
                    {new Date(row.date).toLocaleString('ar-KW', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </TableCell>
                  <TableCell className="max-w-xl">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{row.description}</span>
                      {row.contextLabel?.trim() ? (
                        <span className="text-xs text-sky-800 dark:text-sky-200">
                          {row.contextLabel.trim()}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {bankCellKd(row.customerPaidKd)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {bankCellKd(row.companySupportKd)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {bankCellKd(row.debtGoodwillDiscountKd)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {bankCellKd(row.walletCreditKd)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {bankCellKd(row.walletDebitKd)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {bankCellKd(row.arDebitKd)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {bankCellKd(row.arCreditKd)}
                  </TableCell>
                  <TableCell className="font-semibold tabular-nums">
                    {
                      formatArCustomerBalanceWithSide(row.arBalanceKd)
                        .fullLabel
                    }
                  </TableCell>
                </TableRow>
              ))}
            </DataTableShell>
          </div>
        </div>
      </div>
    </section>
  );
}
