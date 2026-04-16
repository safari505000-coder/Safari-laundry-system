import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';
import { Landmark, ReceiptText, Truck, Wallet } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  type BranchRow,
  type DebtByCategoryReport,
  type DailyPosSalesByPaymentMethodReport,
  type DriverBalanceResponse,
  type OwnerWalletSummary,
  type TeamUserRow,
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
  const [dailySplit, setDailySplit] = useState<DailyPosSalesByPaymentMethodReport | null>(
    null,
  );
  const [debtBreakdown, setDebtBreakdown] = useState<DebtByCategoryReport | null>(null);
  const [debtFilter, setDebtFilter] = useState<'ALL' | 'BRANCH' | 'DRIVER' | 'OWNER' | 'CALL_CENTER'>('ALL');
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [users, setUsers] = useState<TeamUserRow[]>([]);
  const [debtBranchId, setDebtBranchId] = useState<string>('ALL');
  const [debtActorUserId, setDebtActorUserId] = useState<string>('ALL');
  const [debtLoading, setDebtLoading] = useState(true);
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
        const from = new Date();
        from.setHours(0, 0, 0, 0);
        const to = new Date();
        to.setHours(23, 59, 59, 999);
        const split = await apiJson<DailyPosSalesByPaymentMethodReport>(
          `/api/finance/reports/daily-pos-sales?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
          { token },
        );
        if (!c) setDailySplit(split);
        if (hasRole('OWNER')) {
          const w = await apiJson<OwnerWalletSummary>(
            '/api/finance/owner/customer-wallet-summary',
            { token },
          );
          if (!c) setWallet(w);
        }
        const branchRows = await apiJson<BranchRow[]>('/api/branches', { token });
        const userRows =
          hasRole('OWNER')
            ? await apiJson<TeamUserRow[]>('/api/users', { token })
            : [];
        if (!c) {
          setBranches(branchRows);
          setUsers(userRows);
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

  useEffect(() => {
    if (
      !token ||
      !hasRole('OWNER', 'MANAGER', 'ACCOUNTANT', 'SUPERVISOR', 'VIEWER')
    )
      return;
    let c = false;
    (async () => {
      setDebtLoading(true);
      try {
        const from = new Date();
        from.setHours(0, 0, 0, 0);
        const to = new Date();
        to.setHours(23, 59, 59, 999);
        const catQ =
          debtFilter === 'ALL' ? '' : `&category=${encodeURIComponent(debtFilter)}`;
        const branchQ =
          debtBranchId !== 'ALL' ? `&branchId=${encodeURIComponent(debtBranchId)}` : '';
        const actorQ =
          debtActorUserId !== 'ALL'
            ? `&actorUserId=${encodeURIComponent(debtActorUserId)}`
            : '';
        const debt = await apiJson<DebtByCategoryReport>(
          `/api/finance/reports/debt-by-category?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}${catQ}${branchQ}${actorQ}`,
          { token },
        );
        if (!c) setDebtBreakdown(debt);
      } catch (e) {
        if (!c && e instanceof ApiError) toast.error(e.message);
      } finally {
        if (!c) setDebtLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [token, hasRole, debtFilter, debtBranchId, debtActorUserId]);

  const branchUsers = users.filter(
    (u) => debtBranchId === 'ALL' || u.branchId === debtBranchId,
  );

  if (!hasRole('OWNER', 'MANAGER', 'ACCOUNTANT', 'SUPERVISOR', 'VIEWER')) {
    return <Navigate to="/" replace />;
  }

  const totalFieldCash =
    drivers?.drivers.length ?
      sumKwdStrings(drivers.drivers.map((x) => x.heldCashTotal))
    : '0.0000';
  const knetTotal =
    dailySplit?.rows.find((r) => r.posPaymentMethod === 'KNET')?.totalRevenue ??
    '0.0000';
  const onlineTotal =
    dailySplit?.rows.length ?
      sumKwdStrings(
        dailySplit.rows
          .filter(
            (r) =>
              r.posPaymentMethod === 'ONLINE' ||
              r.posPaymentMethod === 'PAYMENT_LINK',
          )
          .map((r) => r.totalRevenue),
      )
    : '0.0000';
  const debtRows = debtBreakdown?.rows ?? [];
  const debtOnAccountTotal =
    dailySplit?.rows.find((r) => r.posPaymentMethod === 'DEBT_ON_ACCOUNT')
      ?.totalRevenue ?? '0.0000';

  const ownerGrid = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3';
  const managerGrid = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';

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
          {(hasRole('OWNER') ? [0, 1, 2, 3, 4, 5] : [0, 1, 2]).map((i) => (
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
            title={t('financials.knetTitle')}
            subtitle={t('financials.knetSubtitle')}
            value={formatKwdLabel(knetTotal)}
            icon={<Landmark className="h-4 w-4" />}
          />
          <MetricCard
            title={t('financials.onlineTitle')}
            subtitle={t('financials.onlineSubtitle')}
            value={formatKwdLabel(onlineTotal)}
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
              <MetricCard
                title={t('financials.debtOnAccountTitle')}
                subtitle={t('financials.debtOnAccountSubtitle')}
                value={formatKwdLabel(debtOnAccountTotal)}
                icon={<ReceiptText className="h-4 w-4" />}
              />
            </>
          : hasRole('OWNER') ?
            <>
              <Skeleton className="h-36 rounded-xl" />
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
          {hasRole('OWNER') && wallet ?
            <p>
              {t('financials.debtSourceIssuedInvoices')}:{' '}
              <strong>{formatKwdLabel(wallet.debtFromIssuedInvoices)}</strong>
            </p>
          : null}
          {hasRole('OWNER') && wallet ?
            <p>
              {t('financials.debtSourceSubscriptionSettled')}:{' '}
              <strong>{formatKwdLabel(wallet.debtSettledBySubscriptions)}</strong>
            </p>
          : null}
          <Separator />
          <p>{t('financials.notesP2')}</p>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 bg-white">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
              <span>{t('financials.debtReportTitle')}</span>
              <span className="text-xs font-normal tabular-nums text-muted-foreground">
                {debtLoading ?
                  '…'
                : t('financials.debtRecordCount', { count: debtRows.length })}
              </span>
            </span>
            <select
              className="h-9 rounded-md border border-zinc-200 bg-background px-2 text-sm"
              value={debtFilter}
              onChange={(e) =>
                setDebtFilter(
                  e.target.value as 'ALL' | 'BRANCH' | 'DRIVER' | 'OWNER' | 'CALL_CENTER',
                )
              }
            >
              <option value="ALL">{t('financials.filterAll')}</option>
              <option value="BRANCH">{t('financials.filterBranch')}</option>
              <option value="DRIVER">{t('financials.filterDriver')}</option>
              <option value="OWNER">{t('financials.filterOwner')}</option>
              <option value="CALL_CENTER">{t('financials.filterCallCenter')}</option>
            </select>
            <select
              className="h-9 rounded-md border border-zinc-200 bg-background px-2 text-sm"
              value={debtBranchId}
              onChange={(e) => {
                const next = e.target.value;
                setDebtBranchId(next);
                setDebtActorUserId('ALL');
              }}
            >
              <option value="ALL">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-zinc-200 bg-background px-2 text-sm"
              value={debtActorUserId}
              onChange={(e) => setDebtActorUserId(e.target.value)}
            >
              <option value="ALL">All users</option>
              {branchUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} (@{u.username})
                </option>
              ))}
            </select>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pe-2">{t('financials.debtCategory')}</th>
                  <th className="py-2 pe-2">{t('financials.debtSource')}</th>
                  <th className="py-2 pe-2 text-end">{t('financials.debtEntries')}</th>
                  <th className="py-2 text-end">{t('financials.debtTotal')}</th>
                </tr>
              </thead>
              <tbody>
                {debtLoading ?
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted-foreground">
                      …
                    </td>
                  </tr>
                : debtRows.map((r, idx) => (
                    <tr key={`${r.category}-${r.source}-${idx}`} className="border-b border-border/60">
                      <td className="py-2 pe-2">{r.category}</td>
                      <td className="py-2 pe-2">{r.source}</td>
                      <td className="py-2 pe-2 text-end tabular-nums">{r.entryCount}</td>
                      <td className="py-2 text-end tabular-nums font-semibold">{formatKwdLabel(r.totalDebt)}</td>
                    </tr>
                  ))}
                {!debtLoading && debtRows.length === 0 ?
                  <tr>
                    <td colSpan={4} className="py-3 text-center text-muted-foreground">
                      {t('financials.noDebtRows')}
                    </td>
                  </tr>
                : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
