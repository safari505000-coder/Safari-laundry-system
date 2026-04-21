import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import {
  Loader2,
  Printer,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import { apiJson, type OrderRow } from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { notify } from '@/lib/notify';
import { Button } from '@/modules/shared/components/ui/button';
import { Input } from '@/modules/shared/components/ui/input';
import { Skeleton } from '@/modules/shared/components/ui/skeleton';
import { TableCell, TableRow } from '@/modules/shared/components/ui/table';
import { orderStatusChipClass } from '@/lib/safari-ui';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import { OrderDetailDialog } from '@/modules/shared/components/orders/order-detail-dialog';
import { InvoiceSupervisorActions } from '@/modules/shared/components/orders/invoice-supervisor-actions';
import {
  DataTableShell,
  FilterBar,
  FilterField,
  PageHeader,
} from '@/modules/shared/components/page';

const METHOD_LABELS: Record<string, string> = {
  CASH: 'كاش',
  KNET: 'كي نت',
  PAYMENT_LINK: 'رابط دفع',
  ONLINE: 'أونلاين',
  DEBT_ON_ACCOUNT: 'على الحساب',
  SUBSCRIPTION_WALLET: 'محفظة الاشتراك',
};

const STATUS_FILTERS = [
  'ALL',
  'PENDING',
  'IN_PROGRESS',
  'READY',
  'OUT_FOR_DELIVERY',
  'COMPLETED',
  'CANCELED',
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number];

/**
 * V19.9 — "كل الفواتير" unified invoice browser.
 *
 * Single-screen lookup for CC agents / supervisors / accountants:
 *   • Phone search (prefix + substring on primary and secondary phone).
 *   • Status filter chip row (ALL by default, so the page shows "every
 *     invoice" as requested).
 *   • Compact table: created-at, customer name+phone, issuer (driver),
 *     branch, payment method, status, total.
 *   • Per-row printable invoice image and, for the supervisor only,
 *     same-day edit + soft-void actions (rendered by the shared
 *     `InvoiceSupervisorActions` component — RBAC re-checked inside).
 *
 * V19.9.5 — Migrated to the shared page primitives (PageHeader,
 * FilterBar, DataTableShell). Behaviour is unchanged; visuals align
 * with the rest of the new design system.
 */
export function AllInvoicesPage() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const dateLocale = useAppLocale();

  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [detailOrder, setDetailOrder] = useState<OrderRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiJson<OrderRow[]>('/api/orders', { token });
      setOrders(data);
    } catch (e) {
      notify.error(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    if (!orders) return [];
    const needle = phone.replace(/\D+/g, '').trim();
    const filtered = orders.filter((o) => {
      if (status !== 'ALL' && o.status !== status) return false;
      if (needle) {
        const p1 = (o.customer.phone ?? '').replace(/\D+/g, '');
        const p2 = (o.customer.phone2 ?? '').replace(/\D+/g, '');
        if (!p1.includes(needle) && !p2.includes(needle)) return false;
      }
      return true;
    });
    return filtered.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [orders, phone, status]);

  if (!can(user, 'invoices.browseAll')) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('nav.allInvoices', { defaultValue: 'كل الفواتير' })}
        subtitle="بحث برقم التليفون عبر كل الفواتير الصادرة — مع صورة الفاتورة والموظف المُصدِر والفرع والحالة."
        tone="blue"
        actions={
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
            <span>تحديث</span>
          </Button>
        }
      />

      <FilterBar
        actions={
          <div className="text-xs text-muted-foreground tabular-nums">
            {rows.length} فاتورة
          </div>
        }
      >
        <FilterField
          label="بحث برقم التليفون"
          className="min-w-[16rem] flex-1"
        >
          <div className="relative">
            <Search
              className="pointer-events-none absolute start-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="phone"
              inputMode="numeric"
              dir="ltr"
              placeholder="مثال: 9XXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="ps-8 pe-8 tabular-nums"
            />
            {phone ? (
              <button
                type="button"
                onClick={() => setPhone('')}
                className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition hover:text-foreground"
                aria-label="مسح"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </FilterField>
        <FilterField label="الحالة" className="min-w-[18rem] flex-1">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((s) => {
              const active = status === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={
                    'rounded-full border px-3 py-1 text-xs font-medium transition ' +
                    (active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground')
                  }
                >
                  {s === 'ALL'
                    ? 'الكل'
                    : t(`orderStatus.${s}`, {
                        defaultValue: s.replaceAll('_', ' ').toLowerCase(),
                      })}
                </button>
              );
            })}
          </div>
        </FilterField>
      </FilterBar>

      <OrderDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        order={detailOrder}
        onChanged={() => void load()}
      />

      {loading && rows.length === 0 ? (
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <DataTableShell
          columns={[
            { key: 'date', label: 'التاريخ' },
            { key: 'serial', label: 'رقم الفاتورة' },
            { key: 'customer', label: 'العميل' },
            { key: 'driver', label: 'الموظف المُصدِر' },
            { key: 'branch', label: 'الفرع' },
            { key: 'method', label: 'طريقة الدفع' },
            { key: 'status', label: 'الحالة' },
            { key: 'total', label: 'الإجمالي', align: 'end', numeric: true },
            { key: 'actions', label: 'إجراءات', align: 'end' },
          ]}
          empty={rows.length === 0}
          emptyState={
            phone || status !== 'ALL'
              ? 'لا توجد فواتير مطابقة لمعايير البحث.'
              : 'لا توجد فواتير.'
          }
          scrollClassName="max-h-[min(72vh,720px)]"
        >
          {rows.map((o) => (
            <TableRow
              key={o.id}
              className="cursor-pointer"
              onClick={() => {
                setDetailOrder(o);
                setDetailOpen(true);
              }}
            >
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                {new Date(o.createdAt).toLocaleString(dateLocale)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs">
                {o.serialNumber ? (
                  <span className="font-medium tabular-nums">
                    #{o.serialNumber}
                  </span>
                ) : o.invoiceNumber ? (
                  <span className="tabular-nums">{o.invoiceNumber}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="max-w-[220px]">
                <div className="truncate text-sm font-medium">
                  {o.customer.displayName ?? '—'}
                </div>
                <div
                  dir="ltr"
                  className="truncate text-xs text-muted-foreground tabular-nums"
                >
                  {o.customer.phone}
                </div>
              </TableCell>
              <TableCell className="max-w-[180px] truncate text-sm">
                {o.driver ? (
                  o.driver.fullName
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {o.driver?.branch?.name ?? '—'}
              </TableCell>
              <TableCell className="text-xs">
                {o.posPaymentMethod ? (
                  METHOD_LABELS[o.posPaymentMethod] ?? o.posPaymentMethod
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <span className={orderStatusChipClass(o.status)}>
                  {t(`orderStatus.${o.status}`, {
                    defaultValue: o.status.replaceAll('_', ' ').toLowerCase(),
                  })}
                </span>
              </TableCell>
              <TableCell className="text-end font-semibold tabular-nums">
                {formatKwdLabel(o.totalPrice)}
              </TableCell>
              <TableCell className="text-end">
                <div
                  className="flex items-center justify-end gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <a
                    href={`/invoices/${o.id}/print`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="عرض صورة الفاتورة"
                    aria-label="عرض صورة الفاتورة"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:border-primary hover:bg-primary/5 hover:text-primary"
                  >
                    <Printer className="h-4 w-4" aria-hidden />
                  </a>
                  <InvoiceSupervisorActions
                    order={{
                      id: o.id,
                      createdAtIso: o.createdAt,
                      status: o.status,
                      totalKd: o.totalPrice,
                      paymentMethod: o.posPaymentMethod ?? null,
                      notes: o.notes ?? null,
                    }}
                    onChanged={() => void load()}
                    compact
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </DataTableShell>
      )}
    </div>
  );
}
