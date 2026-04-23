import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Filter, Plus, RotateCcw, Search } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { notify } from '@/lib/notify';
import { can } from '@/modules/shared/auth/access-matrix';
import {
  type InvoiceFilterDriverRow,
  type InvoiceListFilters,
  type OrderRow,
  getInvoiceFilterDrivers,
  getInvoices,
} from '@/lib/api';
import { CreateOrderDialog } from '@/modules/shared/components/orders/create-order-dialog';
import { OrderDetailDialog } from '@/modules/shared/components/orders/order-detail-dialog';
import { OrderScanInput } from '@/modules/shared/components/orders/order-scan-input';
import { Button } from '@/modules/shared/components/ui/button';
import { Input } from '@/modules/shared/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/shared/components/ui/select';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import { formatKwdLabel } from '@/lib/kwd';
import { Card, CardContent } from '@/modules/shared/components/ui/card';
import { ScrollArea } from '@/modules/shared/components/ui/scroll-area';
import { Skeleton } from '@/modules/shared/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';
import { orderStatusChipClass } from '@/lib/safari-ui';

// V19.22.5 — Invoices-page filter constants. Kept out of the React
// render tree so their reference identity is stable across renders
// and they do not re-create Select options on every keystroke.
const ALL = '__ALL__';

const ORDER_STATUS_VALUES = [
  'PENDING',
  'PICKED_UP',
  'IN_PROGRESS',
  'OUT_FOR_DELIVERY',
  'COMPLETED',
  'CANCELED',
] as const;

const CASH_STATUS_VALUES = [
  'UNPAID',
  'PAID_TO_DRIVER',
  'HANDED_OVER_TO_OFFICE',
  'PAID_ONLINE',
] as const;

const PAYMENT_METHOD_VALUES = [
  'CASH',
  'KNET',
  'PAYMENT_LINK',
  'ONLINE',
  'DEBT_ON_ACCOUNT',
  'SUBSCRIPTION_WALLET',
] as const;

function OrderStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const label = t(`orderStatus.${status}`, {
    defaultValue: status.replaceAll('_', ' ').toLowerCase(),
  });
  return <span className={orderStatusChipClass(status)}>{label}</span>;
}

type LocalFilters = {
  driverId: string;
  status: string;
  cashStatus: string;
  posPaymentMethod: string;
  from: string;
  to: string;
  q: string;
};

const EMPTY_FILTERS: LocalFilters = {
  driverId: ALL,
  status: ALL,
  cashStatus: ALL,
  posPaymentMethod: ALL,
  from: '',
  to: '',
  q: '',
};

export function OrdersPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const dateLocale = useAppLocale();
  const { token, user, hasRole } = useAuth();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOrder, setDetailOrder] = useState<OrderRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Driver is always locked to their own rows, so we hide the
  // driver dropdown + any branch scoping controls.
  const isDriver = (hasRole('DRIVER') ?? false) && !hasRole('OWNER', 'GENERAL_MANAGER');

  const [filters, setFilters] = useState<LocalFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [branchDrivers, setBranchDrivers] = useState<
    InvoiceFilterDriverRow[] | null
  >(null);

  const activeServerFilters: InvoiceListFilters = useMemo(() => {
    const out: InvoiceListFilters = {};
    if (filters.driverId !== ALL) out.driverId = filters.driverId;
    if (filters.status !== ALL) out.status = filters.status;
    if (filters.cashStatus !== ALL) out.cashStatus = filters.cashStatus;
    if (filters.posPaymentMethod !== ALL)
      out.posPaymentMethod = filters.posPaymentMethod;
    if (filters.from) out.from = filters.from;
    if (filters.to) out.to = filters.to;
    if (filters.q.trim()) out.q = filters.q.trim();
    return out;
  }, [filters]);

  const loadOrders = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await getInvoices(token, activeServerFilters);
      setOrders(data);
    } catch (e) {
      notify.error(e);
    } finally {
      setLoading(false);
    }
  }, [token, activeServerFilters]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (!token || isDriver) return;
    let cancelled = false;
    void getInvoiceFilterDrivers(token)
      .then((rows) => {
        if (!cancelled) setBranchDrivers(rows);
      })
      .catch(() => {
        /* optional dropdown — ignore failures, filter just won't offer a driver list */
      });
    return () => {
      cancelled = true;
    };
  }, [token, isDriver]);

  useEffect(() => {
    const st = location.state as { openCreate?: boolean } | undefined;
    if (st?.openCreate) {
      setCreateOpen(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  /*
   * Dastur §1 — POS is the Manager's primary sales tool, so "طلب جديد"
   * is hidden for MANAGER to funnel them through /pos instead.
   *
   * Dastur §2 (V19.3) — Call Center does NOT issue invoices. Their job
   * is subscriptions, collections, and WhatsApp outreach. The "طلب جديد"
   * button is therefore only shown to DRIVER (who creates field orders
   * via POST /orders/quick).
   */
  const canCreate = can(user, 'orders.createQuick');

  const rows = orders ?? [];
  const resultCount = orders?.length ?? 0;
  const hasActiveFilters =
    Object.keys(activeServerFilters).length > 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            {t('orders.title')}
          </h1>
          <p className="text-sm text-zinc-500">{t('orders.subtitle')}</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[280px] sm:items-end">
          <OrderScanInput
            token={token}
            className="w-full"
            onOrderLoaded={(o) => {
              setDetailOrder(o);
              setDetailOpen(true);
            }}
          />
          {canCreate ?
            <Button
              type="button"
              className="gap-2 self-stretch sm:self-end"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t('orders.create.openButton')}
            </Button>
          : null}
        </div>
      </header>

      <CreateOrderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void loadOrders()}
      />

      <OrderDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        order={detailOrder}
        onChanged={() => void loadOrders()}
      />

      <Card className="rounded-[20px] border-border bg-card shadow-sm">
        <CardContent className="p-0">
          <div className="flex flex-col gap-2 border-b border-border/60 bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-2 self-start text-zinc-700"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
            >
              <Filter className="h-4 w-4" aria-hidden />
              {t('orders.filters.title')}
              {hasActiveFilters ? (
                <span className="ms-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-900 px-1.5 text-[11px] font-semibold text-white">
                  {Object.keys(activeServerFilters).length}
                </span>
              ) : null}
            </Button>
            <div className="text-xs text-zinc-500">
              {t('orders.filters.resultCount', { count: resultCount })}
            </div>
          </div>

          {filtersOpen ? (
            <div className="grid gap-3 border-b border-border/60 bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-4">
              {!isDriver ? (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-zinc-600">
                    {t('orders.filters.driver')}
                  </label>
                  <Select
                    value={filters.driverId}
                    onValueChange={(v) =>
                      setFilters((f) => ({ ...f, driverId: v ?? '' }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('orders.filters.driverAll')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>
                        {t('orders.filters.driverAll')}
                      </SelectItem>
                      {(branchDrivers ?? []).map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.fullName}
                          {d.branchName ? ` — ${d.branchName}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-600">
                  {t('orders.filters.status')}
                </label>
                <Select
                  value={filters.status}
                  onValueChange={(v) => setFilters((f) => ({ ...f, status: v ?? '' }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('orders.filters.statusAll')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>
                      {t('orders.filters.statusAll')}
                    </SelectItem>
                    {ORDER_STATUS_VALUES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`orderStatus.${s}`, {
                          defaultValue: s.replaceAll('_', ' ').toLowerCase(),
                        })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-600">
                  {t('orders.filters.cashStatus')}
                </label>
                <Select
                  value={filters.cashStatus}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, cashStatus: v ?? '' }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t('orders.filters.cashStatusAll')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>
                      {t('orders.filters.cashStatusAll')}
                    </SelectItem>
                    {CASH_STATUS_VALUES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`cashStatus.${s}`, {
                          defaultValue: s.replaceAll('_', ' '),
                        })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-600">
                  {t('orders.filters.paymentMethod')}
                </label>
                <Select
                  value={filters.posPaymentMethod}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, posPaymentMethod: v ?? '' }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t('orders.filters.paymentMethodAll')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>
                      {t('orders.filters.paymentMethodAll')}
                    </SelectItem>
                    {PAYMENT_METHOD_VALUES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {t(`posPaymentMethod.${m}`, {
                          defaultValue: m.replaceAll('_', ' '),
                        })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-600">
                  {t('orders.filters.from')}
                </label>
                <Input
                  type="date"
                  value={filters.from}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, from: e.target.value }))
                  }
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-600">
                  {t('orders.filters.to')}
                </label>
                <Input
                  type="date"
                  value={filters.to}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, to: e.target.value }))
                  }
                />
              </div>

              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs font-medium text-zinc-600">
                  {t('orders.filters.search')}
                </label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute start-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                    aria-hidden
                  />
                  <Input
                    className="ps-8"
                    value={filters.q}
                    placeholder={t('orders.filters.searchPlaceholder')}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, q: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="flex items-end">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-2"
                  disabled={!hasActiveFilters}
                  onClick={() => setFilters(EMPTY_FILTERS)}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  {t('orders.filters.reset')}
                </Button>
              </div>
            </div>
          ) : null}

          {loading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-zinc-500">
              {t('orders.filters.empty')}
            </div>
          ) : (
            <ScrollArea className="h-[min(70vh,640px)]">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t('orders.colCreated')}</TableHead>
                    <TableHead>{t('orders.colCustomer')}</TableHead>
                    <TableHead>{t('orders.colDriver')}</TableHead>
                    <TableHead>{t('orders.colStatus')}</TableHead>
                    <TableHead>{t('orders.colCash')}</TableHead>
                    <TableHead className="text-end">
                      {t('orders.colTotal')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((o) => (
                    <TableRow
                      key={o.id}
                      className="cursor-pointer"
                      onClick={() => {
                        setDetailOrder(o);
                        setDetailOpen(true);
                      }}
                    >
                      <TableCell className="whitespace-nowrap text-xs text-zinc-500">
                        {new Date(o.createdAt).toLocaleString(dateLocale)}
                      </TableCell>
                      <TableCell>
                        <div className="safari-table-primary">
                          {o.customer.phone}
                        </div>
                        {o.customer.address ?
                          <div className="text-xs text-zinc-500">
                            {o.customer.address}
                          </div>
                        : null}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">
                        {o.driver ?
                          `${o.driver.fullName} (@${o.driver.username})`
                        : t('orders.dash')}
                      </TableCell>
                      <TableCell>
                        <OrderStatusBadge status={o.status} />
                      </TableCell>
                      <TableCell className="text-xs text-zinc-600">
                        {t(`cashStatus.${o.cashStatus}`, {
                          defaultValue: o.cashStatus.replaceAll('_', ' '),
                        })}
                      </TableCell>
                      <TableCell className="text-end font-semibold tabular-nums">
                        {formatKwdLabel(o.totalPrice)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
