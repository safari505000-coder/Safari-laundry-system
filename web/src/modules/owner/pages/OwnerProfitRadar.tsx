import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, Building2, CircleDollarSign, Loader2, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import {
  type BranchRow,
  type ExpenseRow,
  type IssuedInvoicesReport,
  apiJson,
  ApiError,
  getOperatingStatus,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { hasMasterIslandAccess } from '@/modules/shared/auth/is-master-access';
import { usePriceList } from '@/modules/shared/hooks/use-price-list';
import { Button, buttonVariants } from '@/modules/shared/components/ui/button';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';

type BranchPnlRow = {
  branchId: string | null;
  branchName: string;
  income: number;
  expenses: number;
  profit: number;
};

function kuwaitFinancialRangeIso(financialDateIso: string): { from: string; to: string } {
  const from = new Date(`${financialDateIso}T00:00:00+03:00`);
  const to = new Date(`${financialDateIso}T23:59:59.999+03:00`);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Global profit / branch P&L — Owner island only. */
export function OwnerProfitRadar() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const allowed = hasMasterIslandAccess(user);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BranchPnlRow[]>([]);
  const [financialDateLabel, setFinancialDateLabel] = useState<string>('');
  const priceList = usePriceList({ token });

  const load = useCallback(async () => {
    if (!token || !allowed) return;
    setLoading(true);
    try {
      const status = await getOperatingStatus();
      setFinancialDateLabel(status.financialDateLabel);
      const { from, to } = kuwaitFinancialRangeIso(status.financialDateIso);
      const qs = new URLSearchParams({ from, to });

      const [branches, invoices, expenses] = await Promise.all([
        apiJson<BranchRow[]>('/api/branches', { token }),
        apiJson<IssuedInvoicesReport>(`/api/reports/issued-invoices?${qs.toString()}`, {
          token,
        }),
        apiJson<ExpenseRow[]>(`/api/expenses?${qs.toString()}`, { token }),
      ]);

      const branchNameById = new Map<string, string>();
      for (const b of branches) branchNameById.set(b.id, b.name);

      const incomeByBranch = new Map<string | null, number>();
      for (const inv of invoices.rows) {
        const amount = Number.parseFloat(inv.totalPrice || '0');
        const key = inv.driver?.branchId ?? null;
        incomeByBranch.set(key, (incomeByBranch.get(key) ?? 0) + (Number.isFinite(amount) ? amount : 0));
      }

      const expensesByBranch = new Map<string | null, number>();
      for (const exp of expenses) {
        if (exp.status !== 'APPROVED' && exp.status !== 'AUDIT') continue;
        const amount = Number.parseFloat(exp.amount || '0');
        const key = exp.branchId ?? null;
        expensesByBranch.set(key, (expensesByBranch.get(key) ?? 0) + (Number.isFinite(amount) ? amount : 0));
      }

      const keys = new Set<string | null>([
        ...incomeByBranch.keys(),
        ...expensesByBranch.keys(),
      ]);
      const merged = [...keys].map((branchId) => {
        const income = incomeByBranch.get(branchId) ?? 0;
        const exp = expensesByBranch.get(branchId) ?? 0;
        const name =
          branchId ? (branchNameById.get(branchId) ?? t('ownerDashboard.unknownBranch')) : t('ownerDashboard.unassignedBranch');
        return {
          branchId,
          branchName: name,
          income,
          expenses: exp,
          profit: income - exp,
        };
      });
      merged.sort((a, b) => b.profit - a.profit);
      setRows(merged);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [allowed, t, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const income = rows.reduce((s, r) => s + r.income, 0);
    const expenses = rows.reduce((s, r) => s + r.expenses, 0);
    return {
      income,
      expenses,
      profit: income - expenses,
    };
  }, [rows]);

  const maxIncome = useMemo(
    () => Math.max(1, ...rows.map((r) => r.income)),
    [rows],
  );
  const maxExpenses = useMemo(
    () => Math.max(1, ...rows.map((r) => r.expenses)),
    [rows],
  );

  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6 rounded-2xl bg-white p-4 text-slate-950 sm:p-6">
      <header className="space-y-2 border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
          {t('ownerDashboard.title')}
        </h1>
        <p className="text-sm text-slate-700">{t('ownerDashboard.subtitle')}</p>
        <p className="text-xs font-semibold text-slate-800">
          {t('ownerDashboard.financialDay')}: {financialDateLabel || '—'}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-slate-300 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CircleDollarSign className="h-4 w-4 text-slate-900" />
              {t('ownerDashboard.totalIncome')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-950">{formatKwdLabel(totals.income.toFixed(3))}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-300 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Building2 className="h-4 w-4 text-slate-900" />
              {t('ownerDashboard.totalExpenses')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-950">{formatKwdLabel(totals.expenses.toFixed(3))}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-300 bg-slate-950 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-white">
              <Shield className="h-4 w-4 text-white" />
              {t('ownerDashboard.netProfit')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-white">{formatKwdLabel(totals.profit.toFixed(3))}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-300 bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base text-slate-900">{t('ownerDashboard.branchCollections')}</CardTitle>
          <Button variant="outline" size="sm" onClick={() => void load()} className="border-slate-300 text-slate-900">
            {t('ownerDashboard.refresh')}
          </Button>
        </CardHeader>
        <CardContent>
          {loading ?
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-slate-700" />
            </div>
          : <Table>
              <TableHeader>
                <TableRow className="border-slate-200">
                  <TableHead className="font-semibold text-slate-900">{t('ownerDashboard.colBranch')}</TableHead>
                  <TableHead className="text-right font-semibold text-slate-900">{t('ownerDashboard.colIncome')}</TableHead>
                  <TableHead className="text-right font-semibold text-slate-900">{t('ownerDashboard.colExpenses')}</TableHead>
                  <TableHead className="text-right font-semibold text-slate-900">{t('ownerDashboard.colProfit')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.branchId ?? 'none'} className="border-slate-100">
                    <TableCell className="font-medium text-slate-900">{r.branchName}</TableCell>
                    <TableCell className="text-right font-semibold text-slate-900">{formatKwdLabel(r.income.toFixed(3))}</TableCell>
                    <TableCell className="text-right font-semibold text-slate-900">{formatKwdLabel(r.expenses.toFixed(3))}</TableCell>
                    <TableCell className="text-right font-bold text-slate-950">{formatKwdLabel(r.profit.toFixed(3))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          }
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-slate-300 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-slate-900">{t('ownerDashboard.incomeVsExpenses')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {rows.map((r) => (
              <div key={`bars-${r.branchId ?? 'none'}`} className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-900">{r.branchName}</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-16 text-[11px] font-semibold text-slate-900">{t('ownerDashboard.incomeShort')}</span>
                    <div className="h-3 flex-1 rounded bg-slate-200">
                      <div
                        className="h-3 rounded bg-slate-900"
                        style={{ width: `${Math.max(6, (r.income / maxIncome) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-16 text-[11px] font-semibold text-slate-900">{t('ownerDashboard.expensesShort')}</span>
                    <div className="h-3 flex-1 rounded bg-slate-200">
                      <div
                        className="h-3 rounded bg-slate-600"
                        style={{ width: `${Math.max(6, (r.expenses / maxExpenses) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-300 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-slate-900">{t('ownerDashboard.reactorHealth')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-900">
            <p>
              {t('ownerDashboard.itemsLoaded')}: <strong>{priceList.items.length}</strong>
            </p>
            <p>
              {t('ownerDashboard.categoriesLoaded')}: <strong>{priceList.categories.length}</strong>
            </p>
            <p>
              {t('ownerDashboard.bridgeStatus')}:{' '}
              <strong>{priceList.failed ? t('ownerDashboard.bridgeFailed') : t('ownerDashboard.bridgeHealthy')}</strong>
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-300 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">{t('ownerDashboard.quickLinks')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {[
            { to: '/deposits-audit', label: t('ownerDashboard.linkDepositAudit') },
            { to: '/deposit-verification', label: t('ownerDashboard.linkDepositVerification') },
            { to: '/collections', label: t('ownerDashboard.linkCollections') },
            { to: '/whatsapp-tools', label: t('ownerDashboard.linkWhatsappTools') },
            { to: '/knet-audit', label: t('nav.knetAudit') },
          ].map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'justify-between border-slate-300 text-slate-900 hover:bg-slate-100',
              )}
            >
              {link.label}
              <ArrowRight className="h-4 w-4" />
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
