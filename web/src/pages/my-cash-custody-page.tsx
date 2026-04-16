import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { apiJson, type OrderRow } from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function whatsappHref(phone?: string | null): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, '');
  if (!d) return null;
  return `https://wa.me/${d.startsWith('965') ? d : `965${d}`}`;
}

export function MyCashCustodyPage() {
  const { t } = useTranslation();
  const { hasRole, token } = useAuth();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  if (!hasRole('DRIVER')) return <Navigate to="/" replace />;

  useEffect(() => {
    if (!token) return;
    void apiJson<OrderRow[]>('/api/orders', { token }).then(setOrders);
  }, [token]);

  const rows = useMemo(
    () =>
      (orders ?? []).filter(
        (o) =>
          o.status === 'COMPLETED' &&
          o.cashStatus === 'PAID_TO_DRIVER' &&
          o.posPaymentMethod === 'CASH',
      ),
    [orders],
  );

  return (
    <div className="space-y-6">
      <Card className="border-red-200 bg-red-50/70">
        <CardHeader>
          <CardTitle>{t('cashCustody.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{t('cashCustody.goal')}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('cashCustody.tableTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('cashCustody.colCustomer')}</TableHead>
                <TableHead>{t('cashCustody.colPhone')}</TableHead>
                <TableHead className="text-end">{t('cashCustody.colAmount')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const phone = r.customer.phone || r.customer.phone2 || '';
                const href = whatsappHref(phone);
                return (
                  <TableRow key={r.id}>
                    <TableCell>{r.customer.displayName || phone}</TableCell>
                    <TableCell>
                      <div className="inline-flex items-center gap-2">
                        <span>{phone || '-'}</span>
                        {href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#25D366]">
                            <MessageCircle className="h-4 w-4" />
                          </a>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-end">{formatKwdLabel(r.totalPrice)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
