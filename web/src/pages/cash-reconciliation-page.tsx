import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import {
  ApiError,
  getCashReconciliation,
  type CashReconciliationSnapshot,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
import { Input } from '@/modules/shared/components/ui/input';
import { Skeleton } from '@/modules/shared/components/ui/skeleton';
import { PageHeader } from '@/modules/shared/components/page/page-header';
import { KpiCard } from '@/modules/shared/components/page/kpi-card';
import {
  FilterBar,
  FilterField,
} from '@/modules/shared/components/page/filter-bar';

function toInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toISOString();
}

function endOfDay(iso: string): string {
  return new Date(`${iso}T23:59:59.999`).toISOString();
}

export function CashReconciliationPage() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const ok = can(user, 'cashReconciliation.view');

  const today = useMemo(() => toInputDate(new Date()), []);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [data, setData] = useState<CashReconciliationSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token || !ok) return;
    setLoading(true);
    try {
      const snap = await getCashReconciliation(token, {
        from: startOfDay(fromDate),
        to: endOfDay(toDate),
      });
      setData(snap);
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : t('cashReconciliation.loadError'),
      );
    } finally {
      setLoading(false);
    }
  }, [token, fromDate, toDate, t, ok]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!ok) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title={t('nav.cashReconciliation')}
        subtitle={t('cashReconciliation.subtitle')}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ?
              <Loader2 className="mr-2 size-4 animate-spin" />
            : <RefreshCw className="mr-2 size-4" />}
            {t('cashReconciliation.refresh')}
          </Button>
        }
      />

      <FilterBar>
        <FilterField label={t('expenses.fromLabel')}>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </FilterField>
        <FilterField label={t('expenses.toLabel')}>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </FilterField>
      </FilterBar>

      {loading && !data ?
        <Skeleton className="h-64 w-full" />
      : data ?
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              label={t('cashReconciliation.collectedInRange')}
              value={formatKwdLabel(data.eventBasedInRange.collectedKd)}
              deltaBadge={`${data.eventBasedInRange.collectedOrderCount} ${t('cashReconciliation.orders')}`}
            />
            <KpiCard
              label={t('cashReconciliation.handedInRange')}
              value={formatKwdLabel(data.eventBasedInRange.handedToManagerKd)}
              deltaBadge={`${data.eventBasedInRange.handedBagCount} ${t('cashReconciliation.bags')}`}
            />
            <KpiCard
              label={t('cashReconciliation.pendingDriversNow')}
              value={formatKwdLabel(data.stateBasedNow.pendingWithDriversKd)}
              deltaBadge={t('cashReconciliation.pendingDriversHint')}
            />
            <KpiCard
              label={t('cashReconciliation.pendingManagersDepositRejected')}
              value={formatKwdLabel(
                data.stateBasedNow.pendingWithManagersDepositOrRejectedKd,
              )}
              deltaBadge={`${data.stateBasedNow.pendingWithManagersDepositOrRejectedBagCount} ${t('cashReconciliation.bags')}`}
            />
            <KpiCard
              label={t('cashReconciliation.awaitingVerification')}
              value={formatKwdLabel(
                data.stateBasedNow.awaitingVerificationKd,
              )}
              deltaBadge={`${data.stateBasedNow.awaitingVerificationBagCount} ${t('cashReconciliation.bags')}`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t('cashReconciliation.notesTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
                {data.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      : null}
    </div>
  );
}
