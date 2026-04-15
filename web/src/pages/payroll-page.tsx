import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Users } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  type BranchRow,
  type PayrollRow,
  type TeamUserRow,
  apiJson,
  ApiError,
} from '@/lib/api';
import { requestExecutiveSummaryRefresh } from '@/lib/executive-summary-refresh';
import { useAppLocale } from '@/hooks/use-app-locale';
import { formatKwdLabel, sumKwdStrings } from '@/lib/kwd';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function monthRangeIso(ym: string): { from: string; to: string } {
  const [ys, ms] = ym.split('-');
  const y = Number.parseInt(ys ?? '0', 10);
  const m = Number.parseInt(ms ?? '1', 10);
  const from = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const to = new Date(y, m, 0, 23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

function payrollNetKd(row: PayrollRow): string {
  const b = Number.parseFloat(row.basicSalary);
  const a = Number.parseFloat(row.allowances);
  const d = Number.parseFloat(row.deductions);
  const n = b + a - d;
  if (!Number.isFinite(n)) return '0.0000';
  return n.toFixed(4);
}

export function PayrollPage() {
  const { t } = useTranslation();
  const dateLocale = useAppLocale();
  const { token, hasRole } = useAuth();

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [users, setUsers] = useState<TeamUserRow[] | null>(null);
  const [branches, setBranches] = useState<BranchRow[] | null>(null);
  const [payrolls, setPayrolls] = useState<PayrollRow[] | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingRefs, setLoadingRefs] = useState(true);
  const [saving, setSaving] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const [empId, setEmpId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [basic, setBasic] = useState('');
  const [allowances, setAllowances] = useState('');
  const [deductions, setDeductions] = useState('');

  const eligibleStaff = useMemo(
    () =>
      (users ?? []).filter(
        (u) => u.safariRole === 'MANAGER' || u.safariRole === 'DRIVER',
      ),
    [users],
  );

  const loadRefs = useCallback(async () => {
    if (!token || !hasRole('OWNER')) return;
    setLoadingRefs(true);
    try {
      const [u, b] = await Promise.all([
        apiJson<TeamUserRow[]>('/api/users', { token }),
        apiJson<BranchRow[]>('/api/branches', { token }),
      ]);
      setUsers(Array.isArray(u) ? u : []);
      setBranches(Array.isArray(b) ? b : []);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoadingRefs(false);
    }
  }, [token, hasRole]);

  const loadPayrolls = useCallback(async () => {
    if (!token || !hasRole('OWNER')) return;
    const { from, to } = monthRangeIso(month);
    setLoadingList(true);
    try {
      const qs = new URLSearchParams({ from, to });
      const data = await apiJson<PayrollRow[]>(
        `/api/payroll?${qs.toString()}`,
        { token },
      );
      setPayrolls(Array.isArray(data) ? data : []);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoadingList(false);
    }
  }, [token, hasRole, month]);

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

  useEffect(() => {
    void loadPayrolls();
  }, [loadPayrolls]);

  useEffect(() => {
    if (!empId || !users?.length) return;
    const u = users.find((x) => x.id === empId);
    if (u?.branchId) setBranchId(u.branchId);
  }, [empId, users]);

  const paidThisMonthKd = useMemo(() => {
    if (!payrolls?.length) return '0.0000';
    return sumKwdStrings(
      payrolls
        .filter((p) => p.status === 'PAID')
        .map((p) => payrollNetKd(p)),
    );
  }, [payrolls]);

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const basicN = Number.parseFloat(basic);
    if (!empId || !branchId || !Number.isFinite(basicN) || basicN < 0) {
      toast.error(t('payroll.validation'));
      return;
    }
    const allowN = Number.parseFloat(allowances || '0');
    const dedN = Number.parseFloat(deductions || '0');
    if (!Number.isFinite(allowN) || allowN < 0 || !Number.isFinite(dedN) || dedN < 0) {
      toast.error(t('payroll.validation'));
      return;
    }
    const { from } = monthRangeIso(month);
    setSaving(true);
    try {
      await apiJson<PayrollRow>('/api/payroll', {
        method: 'POST',
        token,
        body: JSON.stringify({
          userId: empId,
          branchId,
          basicSalary: basicN,
          allowances: allowN,
          deductions: dedN,
          paymentDate: from,
        }),
      });
      toast.success(t('payroll.saved'));
      setBasic('');
      setAllowances('');
      setDeductions('');
      void loadPayrolls();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function markPaid(id: string) {
    if (!token) return;
    setMarkingId(id);
    try {
      await apiJson<PayrollRow>(`/api/payroll/${id}/mark-paid`, {
        method: 'PATCH',
        token,
      });
      toast.success(t('payroll.markedPaid'));
      void loadPayrolls();
      requestExecutiveSummaryRefresh();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setMarkingId(null);
    }
  }

  if (!hasRole('OWNER')) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t('payroll.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('payroll.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="payroll-month">{t('payroll.period')}</Label>
            <Input
              id="payroll-month"
              type="month"
              className="w-[200px]"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-primary/15 shadow-sm lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" aria-hidden />
              {t('payroll.summaryPaidTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-primary">
              {loadingList && !payrolls ?
                '…'
              : formatKwdLabel(paidThisMonthKd)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('payroll.summaryPaidHint')}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-[20px] border-border shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t('payroll.staffTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loadingRefs || !users ?
              <div className="space-y-2 p-6">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            : eligibleStaff.length === 0 ?
              <p className="p-6 text-sm text-muted-foreground">
                {t('payroll.noStaff')}
              </p>
            : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t('payroll.colName')}</TableHead>
                    <TableHead>{t('payroll.colRole')}</TableHead>
                    <TableHead>{t('payroll.colBranch')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eligibleStaff.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.fullName}
                        <span className="ms-2 text-xs text-muted-foreground">
                          @{u.username}
                        </span>
                      </TableCell>
                      <TableCell>
                        {t(`roles.${u.safariRole}`, {
                          defaultValue: u.safariRole,
                        })}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.branch?.name ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[20px] border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{t('payroll.addTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            onSubmit={(e) => void submitAdd(e)}
          >
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
              <Label>{t('payroll.fieldEmployee')}</Label>
              <Select
                value={empId || undefined}
                onValueChange={(v) => setEmpId(v ?? '')}
                disabled={!eligibleStaff.length}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('payroll.pickEmployee')} />
                </SelectTrigger>
                <SelectContent>
                  {eligibleStaff.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.fullName} · {t(`roles.${u.safariRole}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('payroll.fieldBranch')}</Label>
              <Select
                value={branchId || undefined}
                onValueChange={(v) => setBranchId(v ?? '')}
                disabled={!branches?.length}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('payroll.pickBranch')} />
                </SelectTrigger>
                <SelectContent>
                  {(branches ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('payroll.fieldBasic')}</Label>
              <Input
                type="number"
                min={0}
                step="0.0001"
                className="tabular-nums"
                value={basic}
                onChange={(e) => setBasic(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('payroll.fieldAllowances')}</Label>
              <Input
                type="number"
                min={0}
                step="0.0001"
                className="tabular-nums"
                value={allowances}
                onChange={(e) => setAllowances(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('payroll.fieldDeductions')}</Label>
              <Input
                type="number"
                min={0}
                step="0.0001"
                className="tabular-nums"
                value={deductions}
                onChange={(e) => setDeductions(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="flex items-end sm:col-span-2 lg:col-span-3">
              <Button
                type="submit"
                className="gap-2"
                disabled={saving || !empId || !branchId}
              >
                {saving ?
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                : null}
                {t('payroll.submit')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-[20px] border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{t('payroll.listTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadingList && !payrolls ?
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          : !payrolls?.length ?
            <p className="p-6 text-sm text-muted-foreground">
              {t('payroll.listEmpty')}
            </p>
          : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('payroll.colPaidOn')}</TableHead>
                  <TableHead>{t('payroll.colName')}</TableHead>
                  <TableHead>{t('payroll.colBranch')}</TableHead>
                  <TableHead className="text-end">{t('payroll.colNet')}</TableHead>
                  <TableHead>{t('payroll.colStatus')}</TableHead>
                  <TableHead className="w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {payrolls.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(p.paymentDate).toLocaleDateString(dateLocale)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {p.user.fullName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.branch.name}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {formatKwdLabel(payrollNetKd(p))}
                    </TableCell>
                    <TableCell>
                      {p.status === 'PAID' ?
                        <Badge>{t('payroll.statusPaid')}</Badge>
                      : <Badge variant="secondary">{t('payroll.statusPending')}</Badge>}
                    </TableCell>
                    <TableCell>
                      {p.status === 'PENDING' ?
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={markingId === p.id}
                          onClick={() => void markPaid(p.id)}
                        >
                          {markingId === p.id ?
                            <Loader2 className="h-4 w-4 animate-spin" />
                          : t('payroll.markPaid')}
                        </Button>
                      : null}
                    </TableCell>
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
