import { useCallback, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, Phone, Printer, RefreshCw, Search } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { apiJson, type CustomerLedgerResponse } from '@/lib/api';
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

type StatementSource = 'journal' | 'ledger';

type StatementState = JournalStatementResponse & {
  source: StatementSource;
};

const ENABLED =
  (import.meta.env.VITE_ENABLE_JOURNAL_STATEMENT ?? 'true').toLowerCase() !== 'false';
const USE_JOURNAL_API =
  (import.meta.env.VITE_USE_JOURNAL_API ?? '').toLowerCase() === 'true';

const columns: DataTableColumn[] = [
  { key: 'date', label: 'التاريخ' },
  { key: 'description', label: 'البيان' },
  { key: 'debit', label: 'مدين' },
  { key: 'credit', label: 'دائن' },
  { key: 'balance', label: 'الرصيد' },
];

function formatKd(value: string | number | null | undefined): string {
  const n = Number.parseFloat(String(value ?? '0'));
  return Number.isFinite(n) ? n.toFixed(3) : '0.000';
}

function signedDeltaToDebitCredit(delta: number): { debit: string; credit: string } {
  if (delta > 0) return { debit: delta.toFixed(3), credit: '0.000' };
  if (delta < 0) return { debit: '0.000', credit: Math.abs(delta).toFixed(3) };
  return { debit: '0.000', credit: '0.000' };
}

function paymentMethodLabel(
  method: CustomerLedgerResponse['events'][number]['paymentMethod'],
): string {
  switch (method) {
    case 'CASH':
      return 'كاش';
    case 'KNET':
      return 'كي نت';
    case 'ONLINE':
      return 'أونلاين';
    case 'PAYMENT_LINK':
      return 'رابط دفع';
    case 'SUBSCRIPTION_WALLET':
      return 'من رصيد الاشتراك';
    case 'DEBT_ON_ACCOUNT':
      return 'على الحساب';
    default:
      return 'غير محدد';
  }
}

function orderLabel(event: CustomerLedgerResponse['events'][number]): string {
  return event.orderSerial ? `فاتورة رقم ${event.orderSerial}` : 'فاتورة';
}

function eventDescription(event: CustomerLedgerResponse['events'][number]): string {
  switch (event.kind) {
    case 'SUBSCRIPTION_ACTIVATION':
      return `تفعيل اشتراك${event.subscriptionLabel ? ` - ${event.subscriptionLabel}` : ''}`;
    case 'SUBSCRIPTION_CANCELLATION':
      return 'إلغاء اشتراك';
    case 'SUBSCRIPTION_ROLLOVER_CARRY':
      return `ترحيل رصيد اشتراك${event.subscriptionLabel ? ` - ${event.subscriptionLabel}` : ''}`;
    case 'ORDER_SETTLEMENT_SUBSCRIPTION':
      return `خصم ${orderLabel(event)} من الاشتراك`;
    case 'ORDER_PAID_IN_FULL':
      return `تسديد كامل ${orderLabel(event)} - ${paymentMethodLabel(event.paymentMethod)}`;
    case 'ORDER_INVOICE_PARTIAL_PAYMENT':
      return `تسديد جزئي ${orderLabel(event)} - ${paymentMethodLabel(event.paymentMethod)}`;
    case 'ORDER_INVOICE_ON_ACCOUNT':
      return `إضافة ${orderLabel(event)} على الحساب`;
    case 'PARTIAL_DEBT_PAYMENT':
      return `تسديد جزئي من المديونية - ${paymentMethodLabel(event.paymentMethod)}`;
    default:
      break;
  }
  return event.note ?? 'حركة مالية';
}

function nonZeroNumber(...values: Array<string | number | null | undefined>): number {
  for (const value of values) {
    const n = Number.parseFloat(String(value ?? '0'));
    if (Number.isFinite(n) && Math.abs(n) > 0.0001) return n;
  }
  return 0;
}

function eventDebitCredit(event: CustomerLedgerResponse['events'][number]): {
  debit: string;
  credit: string;
  affectsBalance: boolean;
} {
  const before = Number.parseFloat(event.debtBeforeKd ?? '0');
  const after = Number.parseFloat(event.debtAfterKd ?? '0');
  const delta = Number.isFinite(after - before) ? after - before : 0;
  if (Math.abs(delta) > 0.0001) {
    return { ...signedDeltaToDebitCredit(delta), affectsBalance: true };
  }

  if (event.kind === 'ORDER_INVOICE_ON_ACCOUNT') {
    const amount = nonZeroNumber(event.amountKd, event.debtSettledKd);
    return { debit: formatKd(amount), credit: '0.000', affectsBalance: false };
  }

  if (
    event.kind === 'ORDER_PAID_IN_FULL' ||
    event.kind === 'ORDER_INVOICE_PARTIAL_PAYMENT' ||
    event.kind === 'ORDER_SETTLEMENT_SUBSCRIPTION' ||
    event.kind === 'PARTIAL_DEBT_PAYMENT' ||
    event.rawType === 'ORDER_WALLET_SETTLEMENT'
  ) {
    const paid = nonZeroNumber(event.debtSettledKd, event.amountKd);
    return { debit: '0.000', credit: formatKd(paid), affectsBalance: false };
  }

  if (event.rawType === 'SUBSCRIPTION_ACTIVATION') {
    const settled = nonZeroNumber(event.debtSettledKd);
    if (settled > 0) {
      return { debit: '0.000', credit: formatKd(settled), affectsBalance: false };
    }
    return {
      debit: formatKd(event.amountKd),
      credit: '0.000',
      affectsBalance: false,
    };
  }

  if (event.rawType === 'SUBSCRIPTION_CANCELLATION') {
    const amount = nonZeroNumber(event.amountKd, event.debtDiscountKd);
    return { debit: '0.000', credit: formatKd(amount), affectsBalance: false };
  }

  return {
    debit: formatKd(event.amountKd),
    credit: '0.000',
    affectsBalance: false,
  };
}

function ledgerToStatement(ledger: CustomerLedgerResponse): StatementState {
  let running = Number.parseFloat(
    ledger.customer.operationalDebtKd ??
      ledger.customer.effectiveDebtKd ??
      ledger.customer.walletDebtKd ??
      '0',
  );

  const eventRows = [...ledger.events]
    .sort((a, b) => new Date(a.atIso).getTime() - new Date(b.atIso).getTime())
    .map((event) => {
      const before = Number.parseFloat(event.debtBeforeKd ?? '0');
      const after = Number.parseFloat(event.debtAfterKd ?? '0');
      const delta = Number.isFinite(after - before) ? after - before : 0;
      const parts = eventDebitCredit(event);
      if (parts.affectsBalance) {
        running = Number.isFinite(after) ? after : running + delta;
      }
      return {
        entryId: event.id,
        date: event.atIso,
        description: eventDescription(event),
        debit: parts.debit,
        credit: parts.credit,
        balance: formatKd(running),
      };
    });

  const rows =
    eventRows.length > 0
      ? eventRows
      : ledger.invoices.map((invoice) => ({
          entryId: invoice.id,
          date: invoice.completedAtIso ?? invoice.createdAtIso,
          description: `فاتورة${invoice.serial ? ` رقم ${invoice.serial}` : ''}`,
          debit: formatKd(invoice.totalKd),
          credit: '0.000',
          balance: invoice.openDebt ? formatKd(invoice.totalKd) : '0.000',
        }));

  return {
    source: 'ledger',
    balance: formatKd(
      ledger.customer.operationalDebtKd ??
        ledger.customer.effectiveDebtKd ??
        ledger.customer.walletDebtKd,
    ),
    rows,
  };
}

export function CustomerStatementJournalPage() {
  const { token } = useAuth();
  const [customerId, setCustomerId] = useState('');
  const [query, setQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerSearchHit | null>(null);
  const [data, setData] = useState<StatementState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const customerSearch = useCcCustomerSearch(query);

  const loadStatement = useCallback(async (nextCustomerId?: string) => {
    const trimmed = (nextCustomerId ?? customerId).trim();
    if (!trimmed || !token) return;
    setLoading(true);
    setError(null);
    try {
      if (USE_JOURNAL_API) {
        const res = await apiJson<JournalStatementResponse>(
          `/api/finance/journal/customers/${trimmed}/statement`,
          { token },
        );
        if (res.rows.length > 0) {
          setData({ ...res, source: 'journal' });
          return;
        }
      }
      const legacy = await apiJson<CustomerLedgerResponse>(
        `/api/call-center/customers/${trimmed}/ledger`,
        { token },
      );
      setData(ledgerToStatement(legacy));
    } catch {
      try {
        const legacy = await apiJson<CustomerLedgerResponse>(
          `/api/call-center/customers/${trimmed}/ledger`,
          { token },
        );
        setData(ledgerToStatement(legacy));
      } catch {
        setError('تعذر تحميل التقرير. تحقق من اتصال قاعدة البيانات ثم حاول مرة أخرى.');
        return;
      }
    } finally {
      setLoading(false);
    }
  }, [customerId, token]);

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
                    {hit.totalDebtKd} KD
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
          <p className="mt-3 text-sm text-destructive">{customerSearch.error}</p>
        ) : null}
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
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
        <p className="text-sm">تاريخ الطباعة: {new Date().toLocaleString()}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="text-base font-semibold">مصدر التقرير</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {data?.source === 'journal'
              ? 'القيد المزدوج الجديد'
              : 'كشف العميل التشغيلي الحالي'}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="text-base font-semibold">رصيد العميل</h2>
          <p className="mt-2 text-2xl font-bold">{data?.balance ?? '0.000'} KD</p>
          <p className="text-sm text-muted-foreground">حسب التقرير المحمّل.</p>
        </div>
      </div>

      <DataTableShell
        columns={columns}
        empty={(data?.rows.length ?? 0) === 0}
        emptyState="لا توجد حركات لهذا العميل."
      >
        {(data?.rows ?? []).map((row) => (
          <TableRow key={row.entryId}>
            <TableCell>{new Date(row.date).toLocaleString()}</TableCell>
            <TableCell className="max-w-xl truncate">{row.description}</TableCell>
            <TableCell>{row.debit}</TableCell>
            <TableCell>{row.credit}</TableCell>
            <TableCell className="font-semibold">{row.balance}</TableCell>
          </TableRow>
        ))}
      </DataTableShell>
      </div>
    </section>
  );
}
