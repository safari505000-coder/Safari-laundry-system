import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import { formatKwdLabel, sumKwdStrings } from '@/lib/kwd';
import { apiJson, type OrderRow } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/shared/components/ui/table';
import { Badge } from '@/modules/shared/components/ui/badge';
import { buttonVariants } from '@/modules/shared/components/ui/button';
import { cn } from '@/lib/utils';

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
  // V21 Phase 5 — date-filter-driven total routed through the single
  // canonical `sumKwdStrings` helper from `@/lib/kwd`. The previous
  // local `reduce`+`parseFloat` was retired so the page no longer
  // owns any KD math primitive.
  const totalKd = sumKwdStrings(rows.map((r) => r.totalPrice || '0'));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('driverDailySales.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('driverDailySales.goal')}</p>
          <p className="mt-3 text-2xl font-bold text-primary">{formatKwdLabel(totalKd)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('driverDailySales.tableTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('driverDailySales.colCustomer')}</TableHead>
                  <TableHead>{t('driverDailySales.colPhone')}</TableHead>
                  <TableHead className="whitespace-nowrap">{t('driverDailySales.colDate')}</TableHead>
                  <TableHead className="text-end">{t('driverDailySales.colAmount')}</TableHead>
                  <TableHead className="w-[1%] text-center">
                    {t('driverDailySales.colStatus')}
                  </TableHead>
                  <TableHead className="w-[1%] text-center">
                    {t('driverDailySales.colPrint')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.customer.displayName || r.customer.phone}</TableCell>
                    <TableCell>{r.customer.phone || r.customer.phone2 || '-'}</TableCell>
                    <TableCell className="whitespace-nowrap">{new Date(r.createdAt).toLocaleString(locale)}</TableCell>
                    <TableCell className="text-end whitespace-nowrap">{formatKwdLabel(r.totalPrice)}</TableCell>
                    <TableCell className="text-center">
                      {r.hasSupervisorEdit ? (
                        <Badge variant="secondary" className="whitespace-nowrap text-xs">
                          {t('driverDailySales.badgeEdited')}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Link
                        to={`/invoices/${r.id}/print`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          buttonVariants({ variant: 'outline', size: 'sm' }),
                          'h-8 gap-1 inline-flex no-underline',
                        )}
                      >
                        <Printer className="h-3.5 w-3.5" />
                        {t('driverDailySales.print')}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
