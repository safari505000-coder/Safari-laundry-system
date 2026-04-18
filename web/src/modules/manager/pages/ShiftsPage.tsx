import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';
import { Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  type DriverBalanceResponse,
  apiJson,
  ApiError,
} from '@/lib/api';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import { formatKwdLabel } from '@/lib/kwd';
import { Badge } from '@/modules/shared/components/ui/badge';
import { Button } from '@/modules/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import { Skeleton } from '@/modules/shared/components/ui/skeleton';

const POLL_MS = 12_000;

export function ShiftsPage() {
  const { t } = useTranslation();
  const dateLocale = useAppLocale();
  const { token, hasRole } = useAuth();
  const [data, setData] = useState<DriverBalanceResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const canViewStaff = hasRole(
    'OWNER',
    'MANAGER',
    'ACCOUNTANT',
    'SUPERVISOR',
    'VIEWER',
  );
  /*
   * Dastur §3 — the "اعتماد الاستلام" button was removed from this page
   * intentionally. Driver-receipt approval now happens inline on
   * /manager/custody (MyCustodyPage). This page stays read-only.
   */

  const load = useCallback(async () => {
    if (!token || !canViewStaff) return;
    return apiJson<DriverBalanceResponse>('/api/finance/driver-balance', { token })
      .then((d) => setData(d))
      .catch((e) => {
        if (e instanceof ApiError) toast.error(e.message);
      });
  }, [token, canViewStaff]);

  useEffect(() => {
    if (!token || !canViewStaff) {
      setLoading(false);
      return;
    }
    let c = false;
    void (async () => {
      setLoading(true);
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
  }, [token, canViewStaff]);

  useEffect(() => {
    if (!token || !canViewStaff) return;
    const id = window.setInterval(() => {
      void load();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [token, canViewStaff, load]);

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

  const drivers = data?.drivers ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            {t('shifts.title')}
          </h1>
          <p className="text-sm text-zinc-500">{t('shifts.subtitle')}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            void load();
          }}
          disabled={loading}
        >
          {loading ?
            <Loader2 className="h-4 w-4 animate-spin" />
          : <RefreshCw className="h-4 w-4" />}
          {t('ownerDashboard.refresh')}
        </Button>
      </header>

      <div className="grid gap-4">
        {loading && !data ?
          <>
            <Skeleton className="h-36 w-full rounded-xl" />
            <Skeleton className="h-36 w-full rounded-xl" />
          </>
        : drivers.map((d) => {
            return (
              <Card
                key={d.driverId}
                className="border-zinc-200 bg-white shadow-sm"
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium text-zinc-900">
                    {d.fullName}
                  </CardTitle>
                  <p className="text-xs text-zinc-500">
                    @{d.username}
                    {d.employeeId || d.phone ?
                      ` · ${[d.employeeId, d.phone].filter(Boolean).join(' · ')}`
                    : ''}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {d.currentShiftId ?
                      <div className="space-y-1">
                        <Badge variant="outline" className="font-normal">
                          {t('shifts.open')}
                        </Badge>
                        {d.shiftStartedAt ?
                          <p className="text-xs font-medium text-zinc-700">
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
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3">
                    <div className="text-sm">
                      <span className="text-zinc-500">{t('shifts.colPending')}: </span>
                      <span className="tabular-nums font-semibold text-zinc-900">
                        {d.pendingSettlementOrderCount}
                      </span>
                    </div>
                    <div className="text-end">
                      <p className="text-xs text-zinc-500">{t('shifts.colHeld')}</p>
                      <p className="text-lg font-semibold tabular-nums text-zinc-900">
                        {formatKwdLabel(d.heldCashTotal)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>
    </div>
  );
}
