import { useCallback, useState } from 'react';
import { Navigate } from 'react-router-dom';
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
import {
  DataTableShell,
  PageHeader,
  type DataTableColumn,
} from '@/modules/shared/components/page';
import { TableCell, TableRow } from '@/modules/shared/components/ui/table';
import {
  FullJournalEntriesPanel,
  type FullJournalEntry,
} from '@/modules/finance/components/FullJournalEntriesPanel';

/**
 * V21 Phase 5 — pure render-only customer journal statement page.
 *
 * Reads the canonical journal-statement endpoint exclusively. The
 * legacy `ledgerToStatement` reconstruction (parseFloat, signed
 * delta math, running balance derivation, per-event description
 * fabrication) was removed — every displayed value is now produced
 * by the backend canonical journal layer at 4dp Decimal precision
 * and rendered through `lib/kwd` formatters.
 */

type JournalStatementRow = {
  entryId: string;
  date: string;
  description: string;
  debit: string;
  credit: string;
  balance: string;
};

type JournalStatementResponse = {
  balance: string;
  rows: JournalStatementRow[];
};

type FullEntriesResponse = {
  customerId: string;
  entries: FullJournalEntry[];
};

const ENABLED =
  (import.meta.env.VITE_ENABLE_JOURNAL_STATEMENT ?? 'true').toLowerCase() !==
  'false';

const columns: DataTableColumn[] = [
  { key: 'date', label: 'التاريخ' },
  { key: 'description', label: 'البيان' },
  { key: 'debit', label: 'مدين' },
  { key: 'credit', label: 'دائن' },
  { key: 'balance', label: 'الرصيد' },
];

export function CustomerStatementJournalPage() {
  const { token } = useAuth();
  const [customerId, setCustomerId] = useState('');
  const [query, setQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerSearchHit | null>(null);
  const [data, setData] = useState<JournalStatementResponse | null>(null);
  const [fullEntries, setFullEntries] = useState<FullEntriesResponse | null>(
    null,
  );
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
        const [statement, full] = await Promise.all([
          apiJson<JournalStatementResponse>(
            `/api/finance/journal/customers/${trimmed}/statement`,
            { token },
          ),
          apiJson<FullEntriesResponse>(
            `/api/finance/journal/customers/${trimmed}/full-entries`,
            { token },
          ),
        ]);
        setData(statement);
        setFullEntries(full);
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
        title="تقارير العميل"
        subtitle="بحث برقم التلفون، كشف حساب العميل، وطباعة التقرير."
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
          <h1 className="text-2xl font-bold">تقرير العميل</h1>
          <p className="mt-1 text-sm">
            العميل:{' '}
            {selectedCustomer
              ? `${selectedCustomer.displayName} / ${selectedCustomer.phone}`
              : customerId || '-'}
          </p>
          <p className="text-sm">
            تاريخ الطباعة: {new Date().toLocaleString()}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <h2 className="text-base font-semibold">مصدر التقرير</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              قيد دفتر اليومية المزدوج (المصدر القانوني)
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <h2 className="text-base font-semibold">رصيد العميل</h2>
            <p className="mt-2 text-2xl font-bold">
              {formatKwdLabel(data?.balance ?? '0')}
            </p>
            <p className="text-sm text-muted-foreground">حسب التقرير المحمّل.</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold">
              كشف العميل (جانب ذمم العملاء فقط)
            </h3>
            <span className="text-xs text-muted-foreground">
              عرض جانب الذمم لكل قيد مع الرصيد التراكمي.
            </span>
          </div>
          <DataTableShell
            columns={columns}
            empty={(data?.rows.length ?? 0) === 0}
            emptyState="لا توجد حركات لهذا العميل."
          >
            {(data?.rows ?? []).map((row) => (
              <TableRow key={row.entryId}>
                <TableCell>{new Date(row.date).toLocaleString()}</TableCell>
                <TableCell className="max-w-xl truncate">
                  {row.description}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatKwdAmount(row.debit)}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatKwdAmount(row.credit)}
                </TableCell>
                <TableCell className="font-semibold tabular-nums">
                  {formatKwdAmount(row.balance)}
                </TableCell>
              </TableRow>
            ))}
          </DataTableShell>
        </div>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold">
              القيد المزدوج الكامل (مدين + دائن لكل حساب)
            </h3>
            <span className="text-xs text-muted-foreground">
              كل قيد يعرض كافة الأطراف (الصندوق، البنك، الإيرادات،
              الذمم، …) مع تحقق توازن مدين = دائن.
            </span>
          </div>
          <FullJournalEntriesPanel
            entries={fullEntries?.entries ?? []}
            loading={loading && !fullEntries}
          />
        </div>
      </div>
    </section>
  );
}
