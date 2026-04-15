import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Building2, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  type BranchRow,
  type FixedExpenseCategoryApi,
  type FixedExpenseScheduleRow,
  apiJson,
  ApiError,
} from '@/lib/api';
import { requestExecutiveSummaryRefresh } from '@/lib/executive-summary-refresh';
import { useAppLocale } from '@/hooks/use-app-locale';
import { formatKwdLabel } from '@/lib/kwd';
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

const CATEGORIES: FixedExpenseCategoryApi[] = [
  'RENT',
  'ELECTRICITY',
  'LEASE',
  'OTHER',
];

function startOfDayIso(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

export function FixedExpensesPage() {
  const { t } = useTranslation();
  const dateLocale = useAppLocale();
  const { token, hasRole } = useAuth();

  const [branches, setBranches] = useState<BranchRow[] | null>(null);
  const [rows, setRows] = useState<FixedExpenseScheduleRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [branchId, setBranchId] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<FixedExpenseCategoryApi>('RENT');
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [effectiveTo, setEffectiveTo] = useState('');

  const loadBranches = useCallback(async () => {
    if (!token || !hasRole('OWNER')) return;
    try {
      const data = await apiJson<BranchRow[]>('/api/branches', { token });
      setBranches(Array.isArray(data) ? data : []);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    }
  }, [token, hasRole]);

  const loadSchedules = useCallback(async () => {
    if (!token || !hasRole('OWNER')) return;
    setLoading(true);
    try {
      const data = await apiJson<FixedExpenseScheduleRow[]>(
        '/api/fixed-expenses',
        { token },
      );
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, hasRole]);

  useEffect(() => {
    void loadBranches();
  }, [loadBranches]);

  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !branchId) {
      toast.error(t('fixedExpenses.validation'));
      return;
    }
    const amt = Number.parseFloat(monthlyAmount);
    if (!Number.isFinite(amt) || amt < 0) {
      toast.error(t('fixedExpenses.validation'));
      return;
    }
    const tit = title.trim();
    if (tit.length < 1) {
      toast.error(t('fixedExpenses.validation'));
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        branchId,
        title: tit,
        category,
        monthlyAmount: amt,
        effectiveFrom: startOfDayIso(new Date(effectiveFrom)),
      };
      if (effectiveTo.trim()) {
        const end = new Date(effectiveTo);
        end.setHours(23, 59, 59, 999);
        body.effectiveTo = end.toISOString();
      }
      await apiJson<FixedExpenseScheduleRow>('/api/fixed-expenses', {
        method: 'POST',
        token,
        body: JSON.stringify(body),
      });
      toast.success(t('fixedExpenses.saved'));
      setMonthlyAmount('');
      setEffectiveTo('');
      void loadSchedules();
      requestExecutiveSummaryRefresh();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!hasRole('OWNER')) {
    return <Navigate to="/" replace />;
  }

  const activeRows = (rows ?? []).filter((r) => r.isActive);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t('fixedExpenses.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('fixedExpenses.subtitle')}</p>
      </header>

      <Card className="rounded-[20px] border-border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" aria-hidden />
            {t('fixedExpenses.formTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            onSubmit={(e) => void submit(e)}
          >
            <div className="space-y-1.5">
              <Label>{t('fixedExpenses.fieldCategory')}</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory((v ?? 'RENT') as FixedExpenseCategoryApi)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`fixedExpenses.cat.${c}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
              <Label>{t('fixedExpenses.fieldTitle')}</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('fixedExpenses.titlePlaceholder')}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('fixedExpenses.fieldAmount')}</Label>
              <Input
                type="number"
                min={0}
                step="0.0001"
                className="tabular-nums"
                value={monthlyAmount}
                onChange={(e) => setMonthlyAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('fixedExpenses.fieldBranch')}</Label>
              <Select
                value={branchId || undefined}
                onValueChange={(v) => setBranchId(v ?? '')}
                disabled={!branches?.length}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('fixedExpenses.pickBranch')} />
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
              <Label>{t('fixedExpenses.fieldFrom')}</Label>
              <Input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('fixedExpenses.fieldTo')}</Label>
              <Input
                type="date"
                value={effectiveTo}
                onChange={(e) => setEffectiveTo(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                {t('fixedExpenses.optionalEnd')}
              </p>
            </div>
            <div className="flex items-end sm:col-span-2 lg:col-span-3">
              <Button type="submit" className="gap-2" disabled={saving || !branchId}>
                {saving ?
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                : null}
                {t('fixedExpenses.submit')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-[20px] border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{t('fixedExpenses.listTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading && !rows ?
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          : activeRows.length === 0 ?
            <p className="p-6 text-sm text-muted-foreground">
              {t('fixedExpenses.listEmpty')}
            </p>
          : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('fixedExpenses.colSchedule')}</TableHead>
                  <TableHead>{t('fixedExpenses.colCategory')}</TableHead>
                  <TableHead className="text-end">{t('fixedExpenses.colMonthly')}</TableHead>
                  <TableHead>{t('fixedExpenses.colRange')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <span className="font-medium text-foreground">
                        {r.branch.name}: {r.title}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">
                        {t(`fixedExpenses.cat.${r.category}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end tabular-nums font-medium">
                      {formatKwdLabel(r.monthlyAmount)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(r.effectiveFrom).toLocaleDateString(dateLocale)}
                      {' — '}
                      {r.effectiveTo ?
                        new Date(r.effectiveTo).toLocaleDateString(dateLocale)
                      : t('fixedExpenses.openEnded')}
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
