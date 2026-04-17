import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { Building2, CircleDollarSign, Loader2, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import {
  API_EXPENSES,
  type BranchRow,
  type ExpenseRow,
  type IssuedInvoicesReport,
  apiJson,
  ApiError,
  getOperatingStatus,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { hasMasterIslandAccess } from '@/modules/shared/auth/is-master-access';
import { Button } from '@/modules/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';

type RadarMode = 'daily' | 'monthly';

type BranchPnlRow = {
  branchId: string | null;
  branchName: string;
  income: number;
  expenses: number;
  profit: number;
};

function rangeForMode(financialDateIso: string, mode: RadarMode): { from: string; to: string } {
  if (mode === 'monthly') {
    const [y, m] = financialDateIso.split('-').map((n) => Number.parseInt(n, 10));
    const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const to = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    return { from: from.toISOString(), to: to.toISOString() };
  }
  const from = new Date(`${financialDateIso}T00:00:00+03:00`);
  const to = new Date(`${financialDateIso}T23:59:59.999+03:00`);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function OwnerProfitRadar() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const allowed = hasMasterIslandAccess(user);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BranchPnlRow[]>([]);
  const [financialDateLabel, setFinancialDateLabel] = useState<string>('');
  const [mode, setMode] = useState<RadarMode>('daily');

  const load = useCallback(async () => {
    if (!token || !allowed) return;
    setLoading(true);
    try {
      const status = await getOperatingStatus();
      setFinancialDateLabel(status.financialDateLabel);
      const { from, to } = rangeForMode(status.financialDateIso, mode);
      const qs = new URLSearchParams({ from, to });

      const [branches, invoices, expenses] = await Promise.all([
        apiJson<BranchRow[]>('/api/branches', { token }),
        apiJson<IssuedInvoicesReport>(`/api/reports/issued-invoices?${qs.toString()}`, { token }),
        apiJson<ExpenseRow[]>(`${API_EXPENSES}?${qs.toString()}`, { token }),
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

      const keys = new Set<string | null>([...incomeByBranch.keys(), ...expensesByBranch.keys()]);
      const merged = [...keys].map((branchId) => {
        const income = incomeByBranch.get(branchId) ?? 0;
        const exp = expensesByBranch.get(branchId) ?? 0;
        const name = branchId
          ? (branchNameById.get(branchId) ?? t('ownerDashboard.unknownBranch'))
          : t('ownerDashboard.unassignedBranch');
        return { branchId, branchName: name, income, expenses: exp, profit: income - exp };
      });
      merged.sort((a, b) => b.profit - a.profit);
      setRows(merged);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [allowed, mode, t, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const income = rows.reduce((s, r) => s + r.income, 0);
    const expenses = rows.reduce((s, r) => s + r.expenses, 0);
    return { income, expenses, profit: income - expenses };
  }, [rows]);

  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6 rounded-2xl bg-white p-4 text-slate-950 sm:p-6">
      <header className="space-y-2 border-b border-slate-200 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{t('ownerDashboard.title')}</h1>
          <div className="inline-flex rounded-md border border-slate-300 p-1">
            <Button type="button" size="sm" variant={mode === 'daily' ? 'default' : 'ghost'} onClick={() => setMode('daily')}>
              {t('ownerDashboard.modeDaily')}
            </Button>
            <Button type="button" size="sm" variant={mode === 'monthly' ? 'default' : 'ghost'} onClick={() => setMode('monthly')}>
              {t('ownerDashboard.modeMonthly')}
            </Button>
          </div>
        </div>
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
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-slate-700" />
            </div>
          ) : (
            <Table>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
