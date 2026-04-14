import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import {
  type DriverBalanceResponse,
  apiJson,
  ApiError,
} from '@/lib/api';
import { useAppLocale } from '@/hooks/use-app-locale';
import { formatKwdLabel } from '@/lib/kwd';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function ShiftsPage() {
  const { t } = useTranslation();
  const dateLocale = useAppLocale();
  const { token, hasRole } = useAuth();
  const [data, setData] = useState<DriverBalanceResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    if (
      !hasRole(
        'OWNER',
        'MANAGER',
        'ACCOUNTANT',
        'SUPERVISOR',
        'VIEWER',
      )
    ) {
      setLoading(false);
      return;
    }
    let c = false;
    (async () => {
      try {
        const d = await apiJson<DriverBalanceResponse>(
          '/api/finance/driver-balance',
          { token },
        );
        if (!c) setData(d);
      } catch (e) {
        if (!c && e instanceof ApiError) toast.error(e.message);
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [token, hasRole]);

  if (
    !hasRole(
      'OWNER',
      'MANAGER',
      'DRIVER',
      'ACCOUNTANT',
      'SUPERVISOR',
      'VIEWER',
    )
  ) {
    return <Navigate to="/" replace />;
  }

  if (
    hasRole('DRIVER') &&
    !hasRole('OWNER', 'MANAGER', 'ACCOUNTANT', 'SUPERVISOR', 'VIEWER')
  ) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-zinc-900">
          {t('shifts.titleDriver')}
        </h1>
        <Card className="border-zinc-200 bg-white">
          <CardContent className="py-10 text-center text-sm text-zinc-600">
            {t('shifts.driverOnlyBody')}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          {t('shifts.title')}
        </h1>
        <p className="text-sm text-zinc-500">{t('shifts.subtitle')}</p>
      </header>

      <Card className="border-zinc-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-medium">
            {t('shifts.fleetOverview')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ?
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          : <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('shifts.colDriver')}</TableHead>
                  <TableHead>{t('shifts.colShift')}</TableHead>
                  <TableHead>{t('shifts.colPending')}</TableHead>
                  <TableHead className="text-end">{t('shifts.colHeld')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.drivers.map((d) => (
                  <TableRow key={d.driverId}>
                    <TableCell>
                      <div className="font-medium">{d.fullName}</div>
                      <div className="text-xs text-zinc-500">
                        @{d.username}
                        {d.employeeId || d.phone ?
                          ` · ${[d.employeeId, d.phone].filter(Boolean).join(' · ')}`
                        : ''}
                      </div>
                    </TableCell>
                    <TableCell>
                      {d.currentShiftId ?
                        <div className="space-y-1">
                          <Badge variant="outline" className="font-normal">
                            {t('shifts.open')}
                          </Badge>
                          {d.shiftStartedAt ?
                            <p className="text-xs text-zinc-500">
                              {t('shifts.since')}{' '}
                              {new Date(d.shiftStartedAt).toLocaleString(
                                dateLocale,
                              )}
                            </p>
                          : null}
                        </div>
                      : <span className="text-sm text-zinc-400">
                          {t('shifts.noOpenShift')}
                        </span>}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {d.pendingSettlementOrderCount}
                    </TableCell>
                    <TableCell className="text-end font-semibold tabular-nums text-zinc-900">
                      {formatKwdLabel(d.heldCashTotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>}
        </CardContent>
      </Card>
    </div>
  );
}
