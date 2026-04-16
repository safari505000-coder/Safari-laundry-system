import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { apiJson, type DriverBalanceResponse } from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function DriverMonitorPage() {
  const { t } = useTranslation();
  const { token, hasRole } = useAuth();
  const [data, setData] = useState<DriverBalanceResponse | null>(null);
  const canUse = hasRole('CALL_CENTER');

  useEffect(() => {
    if (!token || !canUse) return;
    void apiJson<DriverBalanceResponse>('/api/finance/driver-balance', { token }).then(setData);
  }, [token, canUse]);

  if (!canUse) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <Card className="border-yellow-300 bg-yellow-50/70">
        <CardHeader>
          <CardTitle>{t('driverMonitor.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{t('driverMonitor.goal')}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('driverMonitor.tableTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('driverMonitor.colDriver')}</TableHead>
                <TableHead className="text-end">{t('driverMonitor.colCash')}</TableHead>
                <TableHead className="text-end">{t('driverMonitor.colBills')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.drivers ?? []).map((d) => (
                <TableRow key={d.driverId}>
                  <TableCell>{d.driverName}</TableCell>
                  <TableCell className="text-end">{formatKwdLabel(d.heldCashTotal)}</TableCell>
                  <TableCell className="text-end">{d.heldBillsCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
