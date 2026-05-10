import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import { formatKwdLabel } from '@/lib/kwd';
import { apiJson, type IssuedInvoicesReport } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/shared/components/ui/table';
import { Badge } from '@/modules/shared/components/ui/badge';
import { buttonVariants } from '@/modules/shared/components/ui/button';
import { cn } from '@/lib/utils';

// @V24-LEGACY-MATH: was fetching /api/orders (all) then filtering+summing client-side.
// V25: uses /api/reports/issued-invoices?driverId=me&from=today&to=today
// which returns rows scoped to this driver + today, with server-computed totals.

function todayKuwaitRange(): { from: string; to: string } {
  // Kuwait is UTC+3 year-round.
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const day = `${y}-${m}-${d}`;
  return { from: `${day}T00:00:00.000Z`, to: `${day}T23:59:59.999Z` };
}

export function MyDailySalesPage() {
  const { t } = useTranslation();
  const { hasRole, token, user } = useAuth();
  const locale = useAppLocale();
  const [report, setReport] = useState<IssuedInvoicesReport | null>(null);

  if (!hasRole('DRIVER')) return <Navigate to="/" replace />;

  useEffect(() => {
    if (!token) return;
    const { from, to } = todayKuwaitRange();
    const qs = new URLSearchParams({ from, to });
    // V25 — driver scoped to own ID; server filters + returns totals.totalKd.
    if (user?.id) qs.set('driverId', user.id);
    void apiJson<IssuedInvoicesReport>(
      `/api/reports/issued-invoices?${qs.toString()}`,
      { token },
    ).then(setReport);
  }, [token, user?.id]);

  const rows = report?.rows ?? [];
  // V25 — use server-computed total; no local sum.
  const totalKd = report?.totals?.totalKd ?? '0.000';

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
                    <TableCell>{r.customer.phone || '-'}</TableCell>
                    <TableCell className="whitespace-nowrap">{new Date(r.createdAt).toLocaleString(locale)}</TableCell>
                    <TableCell className="text-end whitespace-nowrap">{formatKwdLabel(r.totalPrice)}</TableCell>
                    <TableCell className="text-center">
                      {r.posPaymentMethod ? (
                        <Badge variant="secondary" className="whitespace-nowrap text-xs">
                          {r.posPaymentMethod}
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
