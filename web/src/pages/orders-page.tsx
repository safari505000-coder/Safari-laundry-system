import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { type OrderRow, apiJson, ApiError } from '@/lib/api';
import { CreateOrderDialog } from '@/modules/shared/components/orders/create-order-dialog';
import { OrderDetailDialog } from '@/modules/shared/components/orders/order-detail-dialog';
import { OrderScanInput } from '@/modules/shared/components/orders/order-scan-input';
import { Button } from '@/modules/shared/components/ui/button';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import { formatKwdLabel } from '@/lib/kwd';
import { Badge } from '@/modules/shared/components/ui/badge';
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

function OrderStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const label = t(`orderStatus.${status}`, {
    defaultValue: status.replaceAll('_', ' ').toLowerCase(),
  });
  const variant =
    status === 'COMPLETED' ? 'default'
    : status === 'CANCELED' ? 'destructive'
    : 'secondary';
  return (
    <Badge variant={variant} className="font-normal">
      {label}
    </Badge>
  );
}

export function OrdersPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const dateLocale = useAppLocale();
  const { token, hasRole } = useAuth();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOrder, setDetailOrder] = useState<OrderRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const loadOrders = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiJson<OrderRow[]>('/api/orders', { token });
      setOrders(data);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    const st = location.state as { openCreate?: boolean } | undefined;
    if (st?.openCreate) {
      setCreateOpen(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  const canCreate = hasRole('DRIVER', 'MANAGER', 'CALL_CENTER');

  const rows =
    orders ?
      [...orders].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    : [];

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
      />

      <Card className="rounded-[20px] border-border bg-card shadow-sm">
        <CardContent className="p-0">
          {loading ?
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          : <ScrollArea className="h-[min(70vh,640px)]">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t('orders.colCreated')}</TableHead>
                    <TableHead>{t('orders.colCustomer')}</TableHead>
                    <TableHead>{t('orders.colDriver')}</TableHead>
                    <TableHead>{t('orders.colStatus')}</TableHead>
                    <TableHead>{t('orders.colCash')}</TableHead>
                    <TableHead className="text-end">{t('orders.colTotal')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="whitespace-nowrap text-xs text-zinc-500">
                        {new Date(o.createdAt).toLocaleString(dateLocale)}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{o.customer.phone}</div>
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
                      <TableCell className="text-end font-medium tabular-nums">
                        {formatKwdLabel(o.totalPrice)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>}
        </CardContent>
      </Card>
    </div>
  );
}

