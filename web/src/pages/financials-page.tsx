import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';
import { Landmark, ReceiptText, Truck, Wallet } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  type DriverBalanceResponse,
  type OwnerWalletSummary,
  apiJson,
  ApiError,
} from '@/lib/api';
import { formatKwdLabel, sumKwdStrings } from '@/lib/kwd';
import { MetricCard } from '@/components/dashboard/metric-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

export function FinancialsPage() {
  const { t } = useTranslation();
  const { token, hasRole } = useAuth();
  const [drivers, setDrivers] = useState<DriverBalanceResponse | null>(null);
  const [wallet, setWallet] = useState<OwnerWalletSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (
      !token ||
      !hasRole('OWNER', 'MANAGER', 'ACCOUNTANT', 'SUPERVISOR', 'VIEWER')
    )
      return;
    let c = false;
    (async () => {
      setLoading(true);
      try {
        const d = await apiJson<DriverBalanceResponse>(
          '/api/finance/driver-balance',
          { token },
        );
        if (!c) setDrivers(d);
        if (hasRole('OWNER')) {
          const w = await apiJson<OwnerWalletSummary>(
            '/api/finance/owner/customer-wallet-summary',
            { token },
          );
          if (!c) setWallet(w);
        }
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

  if (!hasRole('OWNER', 'MANAGER', 'ACCOUNTANT', 'SUPERVISOR', 'VIEWER')) {
    return <Navigate to="/" replace />;
  }

  const totalFieldCash =
    drivers?.drivers.length ?
      sumKwdStrings(drivers.drivers.map((x) => x.heldCashTotal))
    : '0.0000';

  const ownerGrid = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4';
  const managerGrid = 'grid gap-4 sm:grid-cols-2';

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          {t('financials.title')}
        </h1>
        <p className="text-sm text-zinc-500">{t('financials.subtitle')}</p>
      </header>

      {loading ?
        <div className={hasRole('OWNER') ? ownerGrid : managerGrid}>
          {(hasRole('OWNER') ? [0, 1, 2, 3] : [0, 1]).map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      : <div className={hasRole('OWNER') ? ownerGrid : managerGrid}>
          <MetricCard
            title={t('financials.cashTitle')}
            subtitle={t('financials.cashSubtitle')}
            value={formatKwdLabel(totalFieldCash)}
            icon={<Truck className="h-4 w-4" />}
            emphasis
          />
          <MetricCard
            title={t('financials.digitalTitle')}
            subtitle={t('financials.digitalSubtitle')}
            value={formatKwdLabel('0.0000')}
            icon={<Landmark className="h-4 w-4" />}
          />
          {hasRole('OWNER') && wallet ?
            <>
              <MetricCard
                title={t('financials.subscriptionBalancesTitle')}
                subtitle={t('financials.subscriptionBalancesSubtitle')}
                value={formatKwdLabel(wallet.totalWalletLiabilities)}
                icon={<Wallet className="h-4 w-4" />}
              />
              <MetricCard
                title={t('financials.customerDebtTitle')}
                subtitle={t('financials.customerDebtSubtitle')}
                value={formatKwdLabel(wallet.totalCustomerDebts)}
                icon={<ReceiptText className="h-4 w-4" />}
              />
            </>
          : hasRole('OWNER') ?
            <>
              <Skeleton className="h-36 rounded-xl" />
              <Skeleton className="h-36 rounded-xl" />
            </>
          : null}
        </div>}

      <Card className="border-zinc-200 bg-white">
        <CardHeader>
          <CardTitle className="text-base">{t('financials.notesTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-zinc-600">
          <p>{t('financials.notesP1')}</p>
          <Separator />
          <p>{t('financials.notesP2')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
