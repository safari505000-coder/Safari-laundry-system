import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Navigate, Link } from 'react-router-dom';
import {
  Banknote,
  Landmark,
  Loader2,
  Percent,
  ReceiptText,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  API_EXPENSES,
  type BankFeesByBranchResponse,
  type BranchRow,
  type DebtByCategoryReport,
  type DailyPosSalesByPaymentMethodReport,
  type DriverBalanceResponse,
  type ExecutiveSummaryReport,
  type ExpenseRow,
  type IssuedInvoicesReport,
  type OwnerWalletSummary,
  type TeamUserRow,
  EMPTY_EXECUTIVE_SUMMARY_REPORT,
  apiJson,
  ApiError,
} from '@/lib/api';
import { formatKwdLabel, sumKwdStrings } from '@/lib/kwd';
import { MetricCard } from '@/components/dashboard/metric-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import { Separator } from '@/modules/shared/components/ui/separator';
import { Skeleton } from '@/modules/shared/components/ui/skeleton';
import { Button } from '@/modules/shared/components/ui/button';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/modules/shared/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';
import { EXECUTIVE_SUMMARY_REFRESH_EVENT } from '@/lib/executive-summary-refresh';
import { cn } from '@/lib/utils';

function startOfDayIso(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

function endOfDayIso(d: Date): string {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
}

type DrillKey =
  | null
  | 'gross'
  | 'bank'
  | 'expenses'
  | 'payroll'
  | 'net'
  | 'subsidy'
  | 'cash'
  | 'knet'
  | 'online'
  | 'wallet';

export function FinancialsPage() {
  const { t } = useTranslation();
  const { token, hasRole } = useAuth();
  const [from, setFrom] = useState(() => startOfDayIso(new Date()));
  const [to, setTo] = useState(() => endOfDayIso(new Date()));
  const [executive, setExecutive] = useState<ExecutiveSummaryReport>(
    EMPTY_EXECUTIVE_SUMMARY_REPORT,
  );
  const [execLoading, setExecLoading] = useState(true);
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
  const [drill, setDrill] = useState<DrillKey>(null);
  const [drillBusy, setDrillBusy] = useState(false);
  const [drillInvoices, setDrillInvoices] = useState<IssuedInvoicesReport | null>(null);
  const [drillBankFees, setDrillBankFees] = useState<BankFeesByBranchResponse | null>(null);
  const [drillExpenses, setDrillExpenses] = useState<ExpenseRow[] | null>(null);

  const fetchExecutive = useCallback(async () => {
    if (!token || !hasRole('OWNER', 'GENERAL_MANAGER')) return;
    setExecLoading(true);
    try {
      const qs = new URLSearchParams({ from, to });
      const data = await apiJson<ExecutiveSummaryReport>(
        `/api/reports/executive-summary?${qs.toString()}`,
        { token },
      );
      setExecutive({
        ...EMPTY_EXECUTIVE_SUMMARY_REPORT,
        ...data,
        bankFeesTotalKd:
          data.bankFeesTotalKd ?? EMPTY_EXECUTIVE_SUMMARY_REPORT.bankFeesTotalKd,
      });
    } catch (e) {
      setExecutive(EMPTY_EXECUTIVE_SUMMARY_REPORT);
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setExecLoading(false);
    }
  }, [token, hasRole, from, to]);

  useEffect(() => {
    void fetchExecutive();
  }, [fetchExecutive]);

  useEffect(() => {
    const handler = () => {
      void fetchExecutive();
    };
    window.addEventListener(EXECUTIVE_SUMMARY_REFRESH_EVENT, handler);
    return () => window.removeEventListener(EXECUTIVE_SUMMARY_REFRESH_EVENT, handler);
  }, [fetchExecutive]);

  useEffect(() => {
    if (!token || !hasRole('OWNER', 'GENERAL_MANAGER')) return;
    let c = false;
    (async () => {
      setLoading(true);
      try {
        const d = await apiJson<DriverBalanceResponse>(
          '/api/finance/driver-balance',
          { token },
        );
        if (!c) setDrivers(d);
        const split = await apiJson<DailyPosSalesByPaymentMethodReport>(
          `/api/finance/reports/daily-pos-sales?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
          { token },
        );
        if (!c) setDailySplit(split);
        const w = await apiJson<OwnerWalletSummary>(
          '/api/finance/owner/customer-wallet-summary',
          { token },
        );
        if (!c) setWallet(w);
        const branchRows = await apiJson<BranchRow[]>('/api/branches', { token });
        const userRows = await apiJson<TeamUserRow[]>('/api/users', { token });
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
  }, [token, hasRole, from, to]);

  useEffect(() => {
    if (!token || !hasRole('OWNER', 'GENERAL_MANAGER')) return;
    let c = false;
    (async () => {
      setDebtLoading(true);
      try {
        const catQ =
          debtFilter === 'ALL' ? '' : `&category=${encodeURIComponent(debtFilter)}`;
        const branchQ =
          debtBranchId !== 'ALL' ? `&branchId=${encodeURIComponent(debtBranchId)}` : '';
        const actorQ =
          debtActorUserId !== 'ALL'
            ? `&actorUserId=${encodeURIComponent(debtActorUserId)}`
            : '';
        const debt = await apiJson<DebtByCategoryReport>(
          `/api/finance/reports/debt-by-category?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${catQ}${branchQ}${actorQ}`,
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
  }, [token, hasRole, debtFilter, debtBranchId, debtActorUserId, from, to]);

  useEffect(() => {
    if (!drill || !token) return;
    let cancelled = false;
    const qs = new URLSearchParams({ from, to });
    (async () => {
      setDrillBusy(true);
      setDrillInvoices(null);
      setDrillBankFees(null);
      setDrillExpenses(null);
      try {
        if (drill === 'gross') {
          const inv = await apiJson<IssuedInvoicesReport>(
            `/api/reports/issued-invoices?${qs.toString()}`,
            { token },
          );
          if (!cancelled) setDrillInvoices(inv);
        } else if (drill === 'bank') {
          const b = await apiJson<BankFeesByBranchResponse>(
            `/api/reports/bank-fees-by-branch?${qs.toString()}`,
            { token },
          );
          if (!cancelled) setDrillBankFees(b);
        } else if (drill === 'expenses') {
          const ex = await apiJson<ExpenseRow[]>(
            `${API_EXPENSES}?${qs.toString()}`,
            { token },
          );
          if (!cancelled) setDrillExpenses(ex);
        }
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
      } finally {
        if (!cancelled) setDrillBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [drill, token, from, to]);

  if (!hasRole('OWNER', 'GENERAL_MANAGER')) {
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

  const branchUsers = users.filter(
    (u) => debtBranchId === 'ALL' || u.branchId === debtBranchId,
  );

  const ownerGrid = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3';
  const execGrid =
    'grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 print:grid-cols-2';

  const approvedExpenses =
    drillExpenses?.filter((r) => r.status === 'APPROVED' || r.status === 'AUDIT') ??
    [];

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            {t('financials.title')}
          </h1>
          <p className="text-sm text-zinc-500">{t('financials.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="fin-from" className="text-xs">
              {t('financials.rangeFrom')}
            </Label>
            <Input
              id="fin-from"
              type="datetime-local"
              value={from.slice(0, 16)}
              onChange={(e) => setFrom(new Date(e.target.value).toISOString())}
              className="h-9 w-[11.5rem]"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fin-to" className="text-xs">
              {t('financials.rangeTo')}
            </Label>
            <Input
              id="fin-to"
              type="datetime-local"
              value={to.slice(0, 16)}
              onChange={(e) => setTo(new Date(e.target.value).toISOString())}
              className="h-9 w-[11.5rem]"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={execLoading}
            onClick={() => void fetchExecutive()}
          >
            {execLoading ?
              <Loader2 className="h-4 w-4 animate-spin" />
            : <RefreshCw className="h-4 w-4" />}
            {t('financials.refreshExec')}
          </Button>
        </div>
      </header>

      <Card className="border-amber-200/80 bg-amber-50/40">
        <CardContent className="pt-4 text-sm text-zinc-700">
          <p className="font-medium text-zinc-900">{t('financials.profitFormulaTitle')}</p>
          <p className="mt-1">{t('financials.profitFormulaBody')}</p>
        </CardContent>
      </Card>

      {execLoading ?
        <div className={execGrid}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      : <div className={execGrid}>
          <Card
            role="button"
            tabIndex={0}
            className="cursor-pointer overflow-hidden border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-teal-50/90 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setDrill('gross')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setDrill('gross');
              }
            }}
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                <TrendingUp className="h-4 w-4 shrink-0" aria-hidden />
                {t('reports.execGross')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums text-emerald-950">
                {formatKwdLabel(executive.grossRevenueKd ?? '0')}
              </p>
              <p className="mt-1 text-xs text-emerald-800/80">{t('reports.execGrossHint')}</p>
            </CardContent>
          </Card>
          <Card
            role="button"
            tabIndex={0}
            className="cursor-pointer overflow-hidden border-violet-200/80 bg-gradient-to-br from-violet-50 to-purple-50/90 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setDrill('bank')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setDrill('bank');
              }
            }}
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-violet-900">
                <Percent className="h-4 w-4 shrink-0" aria-hidden />
                {t('reports.execBankFees')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums text-violet-950">
                {formatKwdLabel(executive.bankFeesTotalKd ?? '0')}
              </p>
              <p className="mt-1 text-xs text-violet-800/80">{t('reports.execBankFeesHint')}</p>
            </CardContent>
          </Card>
          <Card
            role="button"
            tabIndex={0}
            className="cursor-pointer overflow-hidden border-rose-200/80 bg-gradient-to-br from-rose-50 to-red-50/90 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setDrill('expenses')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setDrill('expenses');
              }
            }}
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-rose-900">
                <TrendingDown className="h-4 w-4 shrink-0" aria-hidden />
                {t('reports.execExpenses')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums text-rose-950">
                {formatKwdLabel(executive.totalExpensesVariableAndFixedKd ?? '0')}
              </p>
              <p className="mt-1 text-xs text-rose-800/80">{t('reports.execExpensesHint')}</p>
            </CardContent>
          </Card>
          <Card
            role="button"
            tabIndex={0}
            className="cursor-pointer overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 to-blue-50/90 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setDrill('payroll')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setDrill('payroll');
              }
            }}
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-sky-900">
                <Users className="h-4 w-4 shrink-0" aria-hidden />
                {t('reports.execPayroll')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums text-sky-950">
                {formatKwdLabel(executive.payrollPaidKd ?? '0')}
              </p>
              <p className="mt-1 text-xs text-sky-800/80">{t('reports.execPayrollHint')}</p>
            </CardContent>
          </Card>
          <Card
            role="button"
            tabIndex={0}
            className={cn(
              'cursor-pointer overflow-hidden border-amber-300/90 bg-gradient-to-br from-amber-50 via-yellow-50 to-amber-100/90 shadow-md ring-1 ring-amber-200/60 transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
            onClick={() => setDrill('net')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setDrill('net');
              }
            }}
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-amber-950">
                <Banknote className="h-4 w-4 shrink-0" aria-hidden />
                {t('reports.execNet')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={cn(
                  'text-2xl font-bold tabular-nums',
                  Number.parseFloat(executive.netProfitKd ?? '0') < 0 ?
                    'text-destructive'
                  : 'text-amber-950',
                )}
              >
                {formatKwdLabel(executive.netProfitKd ?? '0')}
              </p>
              <p className="mt-1 text-xs text-amber-900/80">{t('reports.execNetHint')}</p>
            </CardContent>
          </Card>
        </div>}

      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{t('financials.subsidyBreakdownTitle')}</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDrill('subsidy')}>
              {t('financials.drillDetails')}
            </Button>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              <dt>{t('reports.execSubscriptionSubsidy')}</dt>
              <dd className="tabular-nums font-semibold">
                {formatKwdLabel(executive.subscriptionSubsidyKd ?? '0')}
              </dd>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              <dt>{t('reports.execEnterpriseSubscriptionSubsidy')}</dt>
              <dd className="tabular-nums font-semibold">
                {formatKwdLabel(executive.enterpriseSubscriptionSubsidyKd ?? '0')}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {loading ?
        <div className={ownerGrid}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      : <div className={ownerGrid}>
          <MetricCard
            title={t('financials.cashTitle')}
            subtitle={t('financials.cashSubtitle')}
            value={formatKwdLabel(totalFieldCash)}
            icon={<Truck className="h-4 w-4" />}
            emphasis
            onClick={() => setDrill('cash')}
          />
          <MetricCard
            title={t('financials.knetTitle')}
            subtitle={t('financials.knetSubtitle')}
            value={formatKwdLabel(knetTotal)}
            icon={<Landmark className="h-4 w-4" />}
            onClick={() => setDrill('knet')}
          />
          <MetricCard
            title={t('financials.onlineTitle')}
            subtitle={t('financials.onlineSubtitle')}
            value={formatKwdLabel(onlineTotal)}
            icon={<Landmark className="h-4 w-4" />}
            onClick={() => setDrill('online')}
          />
          {wallet ?
            <>
              <MetricCard
                title={t('financials.subscriptionBalancesTitle')}
                subtitle={t('financials.subscriptionBalancesSubtitle')}
                value={formatKwdLabel(wallet.totalWalletLiabilities)}
                icon={<Wallet className="h-4 w-4" />}
                onClick={() => setDrill('wallet')}
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
          : <>
              <Skeleton className="h-36 rounded-xl" />
              <Skeleton className="h-36 rounded-xl" />
              <Skeleton className="h-36 rounded-xl" />
            </>}
        </div>}

      <Card className="border-zinc-200 bg-white">
        <CardHeader>
          <CardTitle className="text-base">{t('financials.notesTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-zinc-600">
          <p>{t('financials.notesP1')}</p>
          {wallet ?
            <p>
              {t('financials.debtSourceIssuedInvoices')}:{' '}
              <strong>{formatKwdLabel(wallet.debtFromIssuedInvoices)}</strong>
            </p>
          : null}
          {wallet ?
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
                  '...'
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
            <table className="safari-data-table min-w-[560px]">
              <thead>
                <tr>
                  <th>{t('financials.debtCategory')}</th>
                  <th>{t('financials.debtSource')}</th>
                  <th className="text-end">{t('financials.debtEntries')}</th>
                  <th className="text-end">{t('financials.debtTotal')}</th>
                </tr>
              </thead>
              <tbody>
                {debtLoading ?
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted-foreground">
                      ...
                    </td>
                  </tr>
                : debtRows.map((r, idx) => (
                    <tr key={`${r.category}-${r.source}-${idx}`}>
                      <td className="safari-table-primary">{r.category}</td>
                      <td>{r.source}</td>
                      <td className="text-end tabular-nums">{r.entryCount}</td>
                      <td className="text-end font-semibold tabular-nums">
                        {formatKwdLabel(r.totalDebt)}
                      </td>
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

      <Dialog open={drill !== null} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-h-[min(90vh,720px)] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {drill === 'gross' ? t('reports.execGross')
              : drill === 'bank' ? t('reports.execBankFees')
              : drill === 'expenses' ? t('reports.execExpenses')
              : drill === 'payroll' ? t('reports.execPayroll')
              : drill === 'net' ? t('reports.execNet')
              : drill === 'subsidy' ? t('financials.subsidyDrillTitle')
              : drill === 'cash' ? t('financials.cashTitle')
              : drill === 'knet' ? t('financials.knetTitle')
              : drill === 'online' ? t('financials.onlineTitle')
              : drill === 'wallet' ? t('financials.subscriptionBalancesTitle')
              : ''}
            </DialogTitle>
          </DialogHeader>

          {drill === 'net' ?
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>{t('financials.netDrillIntro')}</p>
              <dl className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="flex justify-between gap-2">
                  <dt>{t('reports.execGross')}</dt>
                  <dd className="tabular-nums font-medium">
                    {formatKwdLabel(executive.grossRevenueKd ?? '0')}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>{t('reports.execBankFees')}</dt>
                  <dd className="tabular-nums font-medium">
                    −{formatKwdLabel(executive.bankFeesTotalKd ?? '0')}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>{t('financials.settledAfterFeesLabel')}</dt>
                  <dd className="tabular-nums font-medium">
                    {formatKwdLabel(executive.settledRevenueAfterBankFeesKd ?? '0')}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>{t('reports.execExpenses')}</dt>
                  <dd className="tabular-nums font-medium">
                    −{formatKwdLabel(executive.totalExpensesVariableAndFixedKd ?? '0')}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>{t('reports.execPayroll')}</dt>
                  <dd className="tabular-nums font-medium">
                    −{formatKwdLabel(executive.payrollPaidKd ?? '0')}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 border-t pt-2 font-semibold text-foreground">
                  <dt>{t('reports.execNet')}</dt>
                  <dd className="tabular-nums">
                    {formatKwdLabel(executive.netProfitKd ?? '0')}
                  </dd>
                </div>
              </dl>
              <p className="text-xs">{t('financials.netDrillFootnote')}</p>
            </div>
          : null}

          {drill === 'subsidy' ?
            <p className="text-sm text-muted-foreground">{t('financials.subsidyDrillBody')}</p>
          : null}

          {drill === 'payroll' ?
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">{t('financials.payrollDrillBody')}</p>
              <Link
                to="/payroll"
                className="inline-flex h-9 items-center justify-center rounded-md bg-secondary px-4 text-sm font-medium text-secondary-foreground ring-offset-background transition-colors hover:bg-secondary/80"
              >
                {t('financials.openPayroll')}
              </Link>
            </div>
          : null}

          {drill === 'gross' ?
            drillBusy ?
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            : drillInvoices ?
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('financials.drillColWhen')}</TableHead>
                      <TableHead>{t('financials.drillColInvoice')}</TableHead>
                      <TableHead className="text-end">{t('financials.drillColTotal')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drillInvoices.rows.slice(0, 200).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {new Date(r.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.invoiceNumber ?? r.id}
                        </TableCell>
                        <TableCell className="text-end tabular-nums font-medium">
                          {formatKwdLabel(r.totalPrice)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {drillInvoices.rows.length > 200 ?
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('financials.drillTruncated', { n: 200 })}
                  </p>
                : null}
              </div>
            : null
          : null}

          {drill === 'bank' ?
            drillBusy ?
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            : drillBankFees ?
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('financials.drillColBranch')}</TableHead>
                    <TableHead className="text-end">{t('financials.drillColFees')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drillBankFees.branches.map((b) => (
                    <TableRow key={b.branchId ?? 'null'}>
                      <TableCell>{b.branchId ?? '—'}</TableCell>
                      <TableCell className="text-end tabular-nums">
                        {formatKwdLabel(b.bankFeesKd)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            : null
          : null}

          {drill === 'expenses' ?
            drillBusy ?
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            : <div className="space-y-4">
                <dl className="grid gap-2 text-sm sm:grid-cols-3">
                  <div className="rounded border px-2 py-1">
                    <dt className="text-muted-foreground">{t('financials.expSoapFuel')}</dt>
                    <dd className="font-semibold tabular-nums">
                      {formatKwdLabel(executive.variableSoapFuelKd ?? '0')}
                    </dd>
                  </div>
                  <div className="rounded border px-2 py-1">
                    <dt className="text-muted-foreground">{t('financials.expMisc')}</dt>
                    <dd className="font-semibold tabular-nums">
                      {formatKwdLabel(executive.miscOperationalKd ?? '0')}
                    </dd>
                  </div>
                  <div className="rounded border px-2 py-1">
                    <dt className="text-muted-foreground">{t('financials.expFixed')}</dt>
                    <dd className="font-semibold tabular-nums">
                      {formatKwdLabel(executive.fixedExpensesKd ?? '0')}
                    </dd>
                  </div>
                </dl>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('financials.expColDate')}</TableHead>
                      <TableHead>{t('financials.expColTitle')}</TableHead>
                      <TableHead>{t('financials.expColWho')}</TableHead>
                      <TableHead className="text-end">{t('financials.expColAmount')}</TableHead>
                      <TableHead>{t('financials.expColReceipt')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {approvedExpenses.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {new Date(r.expenseDate).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm">{r.title}</TableCell>
                        <TableCell className="text-sm">
                          {r.recordedBy.fullName}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {formatKwdLabel(r.amount)}
                        </TableCell>
                        <TableCell>
                          {r.receiptUrl ?
                            <a
                              href={r.receiptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline"
                            >
                              {t('financials.openReceipt')}
                            </a>
                          : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {approvedExpenses.length === 0 ?
                  <p className="text-sm text-muted-foreground">{t('financials.noApprovedExpenses')}</p>
                : null}
              </div>
          : null}

          {drill === 'cash' ?
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('financials.drillColDriver')}</TableHead>
                  <TableHead className="text-end">{t('financials.drillColHeldCash')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(drivers?.drivers ?? []).map((d) => (
                  <TableRow key={d.driverId}>
                    <TableCell>
                      {d.fullName} ({d.username})
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {formatKwdLabel(d.heldCashTotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          : null}

          {drill === 'knet' || drill === 'online' ?
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('financials.drillColMethod')}</TableHead>
                  <TableHead className="text-end">{t('financials.drillColTotal')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(dailySplit?.rows ?? [])
                  .filter((r) =>
                    drill === 'knet' ?
                      r.posPaymentMethod === 'KNET'
                    : r.posPaymentMethod === 'ONLINE' ||
                      r.posPaymentMethod === 'PAYMENT_LINK',
                  )
                  .map((r) => (
                    <TableRow key={r.posPaymentMethod}>
                      <TableCell>{r.posPaymentMethod}</TableCell>
                      <TableCell className="text-end tabular-nums">
                        {formatKwdLabel(r.totalRevenue)}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          : null}

          {drill === 'wallet' && wallet ?
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt>{t('financials.walletLiabilities')}</dt>
                <dd className="tabular-nums font-semibold">
                  {formatKwdLabel(wallet.totalWalletLiabilities)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>{t('financials.customerDebts')}</dt>
                <dd className="tabular-nums font-semibold">
                  {formatKwdLabel(wallet.totalCustomerDebts)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>{t('financials.subscriptionUsage')}</dt>
                <dd className="tabular-nums font-semibold">
                  {formatKwdLabel(wallet.totalSubscriptionUsage)}
                </dd>
              </div>
            </dl>
          : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
