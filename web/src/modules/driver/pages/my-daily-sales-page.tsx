import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import { formatKwdLabel } from '@/lib/kwd';
import { apiJson, type OrderRow } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/shared/components/ui/table';

export function MyDailySalesPage() {
  const { t } = useTranslation();
  const { hasRole, token } = useAuth();
  const locale = useAppLocale();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  if (!hasRole('DRIVER')) return <Navigate to="/" replace />;

  useEffect(() => {
    if (!token) return;
    void apiJson<OrderRow[]>('/api/orders', { token }).then(setOrders);
  }, [token]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const rows = (orders ?? []).filter((o) =>
    o.status === 'COMPLETED' && o.createdAt.slice(0, 10) === today,
  );
  const total = rows.reduce((s, r) => s + Number.parseFloat(r.totalPrice || '0'), 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('driverDailySales.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('driverDailySales.goal')}</p>
          <p className="mt-3 text-2xl font-bold text-primary">{formatKwdLabel(total.toFixed(4))}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('driverDailySales.tableTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('driverDailySales.colCustomer')}</TableHead>
                <TableHead>{t('driverDailySales.colPhone')}</TableHead>
                <TableHead>{t('driverDailySales.colDate')}</TableHead>
                <TableHead className="text-end">{t('driverDailySales.colAmount')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.customer.displayName || r.customer.phone}</TableCell>
                  <TableCell>{r.customer.phone || r.customer.phone2 || '-'}</TableCell>
                  <TableCell>{new Date(r.createdAt).toLocaleString(locale)}</TableCell>
                  <TableCell className="text-end">{formatKwdLabel(r.totalPrice)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
