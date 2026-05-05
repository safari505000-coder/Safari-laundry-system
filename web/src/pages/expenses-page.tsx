import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Plus, Receipt } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import { ExpensesAnalyticsDashboard } from '@/components/expenses/expenses-analytics-dashboard';
import {
  API_EXPENSES,
  type BranchRow,
  type ExpenseRow,
  apiJson,
  ApiError,
} from '@/lib/api';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import {
  buildExpenseFilter,
  type ExpensePageMode,
  type ExpenseViewType,
} from '@/lib/expense-filters';
import { formatKwdLabel } from '@/lib/kwd';
import { expenseWorkflowChipClass } from '@/lib/safari-ui';
import { Button } from '@/modules/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/shared/components/ui/select';
import { Textarea } from '@/modules/shared/components/ui/textarea';

type ExpensesPageProps = {
  mode?: ExpensePageMode;
};

type ExpenseStatusFilter =
  | 'ALL'
  | 'PENDING_ACCOUNTANT'
  | 'APPROVED'
  | 'REJECTED'
  | 'AUDIT';

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

function readIsoParam(
  params: URLSearchParams,
  key: string,
  fallback: string,
): string {
  const raw = params.get(key);
  if (!raw) return fallback;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function readStatusParam(params: URLSearchParams): ExpenseStatusFilter {
  const status = params.get('status');
  return status === 'PENDING_ACCOUNTANT' ||
    status === 'APPROVED' ||
    status === 'REJECTED' ||
    status === 'AUDIT'
    ? status
    : 'ALL';
}

export function ExpensesPage({ mode = 'default' }: ExpensesPageProps) {
  const { t } = useTranslation();
  const dateLocale = useAppLocale();
  const { token, user, hasRole, ownerBranchId } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilter = buildExpenseFilter({
    mode,
    type: searchParams.get('type'),
  });
  const [from, setFrom] = useState(() =>
    readIsoParam(searchParams, 'from', startOfDayIso(new Date())),
  );
  const [to, setTo] = useState(() =>
    readIsoParam(searchParams, 'to', endOfDayIso(new Date())),
  );
  const [rows, setRows] = useState<ExpenseRow[] | null>(null);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>(
    () => searchParams.get('branchId') ?? 'ALL',
  );
  const [statusFilter, setStatusFilter] = useState<ExpenseStatusFilter>(() =>
    readStatusParam(searchParams),
  );
  const [expenseType, setExpenseType] = useState<ExpenseViewType>(
    initialFilter.type,
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<'SOAP' | 'FUEL' | 'MISC'>(
    mode === 'cars' ? 'FUEL' : 'MISC',
  );
  const [note, setNote] = useState('');
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);

  const canManage = can(user, 'expenses.record');
  const canView = can(user, 'expenses.view');

  const updateFilterParams = useCallback(
    (
      patch: Partial<{
        from: string;
        to: string;
        branchId: string;
        status: ExpenseStatusFilter;
        type: ExpenseViewType;
      }>,
    ) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);

        if (patch.from) next.set('from', patch.from);
        if (patch.to) next.set('to', patch.to);
        if (patch.branchId !== undefined) {
          if (patch.branchId === 'ALL') next.delete('branchId');
          else next.set('branchId', patch.branchId);
        }
        if (patch.status !== undefined) {
          if (patch.status === 'ALL') next.delete('status');
          else next.set('status', patch.status);
        }
        if (patch.type !== undefined) next.set('type', patch.type);

        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );

  useEffect(() => {
    if (mode !== 'cars') return;
    if (expenseType !== 'car') setExpenseType('car');
    if (searchParams.get('type') !== 'car') {
      updateFilterParams({ type: 'car' });
    }
  }, [expenseType, mode, searchParams, updateFilterParams]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ from, to });
      const effectiveBranch =
        selectedBranch !== 'ALL' ? selectedBranch : ownerBranchId;
      if (effectiveBranch) qs.set('branchId', effectiveBranch);
      if (statusFilter !== 'ALL') qs.set('status', statusFilter);
      const data = await apiJson<ExpenseRow[]>(
        `${API_EXPENSES}?${qs.toString()}`,
        { token },
      );
      const nextRows = Array.isArray(data) ? data : [];
      const expenseFilter = buildExpenseFilter({ mode, type: expenseType });
      setRows(nextRows.filter(expenseFilter.matches));
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [
    token,
    from,
    to,
    expenseType,
    mode,
    ownerBranchId,
    selectedBranch,
    statusFilter,
  ]);

  useEffect(() => {
    if (token && canView) void load();
  }, [token, canView, load]);

  useEffect(() => {
    if (!token || !hasRole('OWNER', 'GENERAL_MANAGER')) return;
    void apiJson<BranchRow[]>('/api/branches', { token })
      .then((data) => setBranches(Array.isArray(data) ? data : []))
      .catch(() => setBranches([]));
  }, [token, hasRole]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !canManage) return;
    const n = Number.parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error(t('expenses.invalidAmount'));
      return;
    }
    setSaving(true);
    try {
      await apiJson<ExpenseRow>(API_EXPENSES, {
        method: 'POST',
        token,
        body: JSON.stringify({
          title: title.trim(),
          amount: n,
          category,
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(receiptPreview ? { receiptUrl: receiptPreview } : {}),
        }),
      });
      toast.success(t('expenses.saved'));
      setTitle('');
      setAmount('');
      setNote('');
      setReceiptPreview(null);
      void load();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  function onFile(f: File | null) {
    if (!f) {
      setReceiptPreview(null);
      return;
    }
    if (f.size > 400_000) {
      toast.error(t('expenses.fileTooLarge'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === 'string') setReceiptPreview(r);
    };
    reader.readAsDataURL(f);
  }

  if (!canView) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === 'cars' ?
            t('expenses.carTitle')
          : mode === 'reports' ?
            t('expenses.reportsTitle')
          : t('expenses.title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {mode === 'cars' ?
            t('expenses.carSubtitle')
          : mode === 'reports' ?
            t('expenses.reportsSubtitle')
          : t('expenses.subtitle')}
        </p>
      </div>

      {canManage ?
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4" />
              {t('expenses.new')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ex-title">{t('expenses.fieldTitle')}</Label>
                <Input
                  id="ex-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ex-amt">{t('expenses.fieldAmount')}</Label>
                <Input
                  id="ex-amt"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('expenses.fieldCategory')}</Label>
                <Select
                  value={category}
                  onValueChange={(v) =>
                    setCategory(v as 'SOAP' | 'FUEL' | 'MISC')
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SOAP">{t('expenses.catSoap')}</SelectItem>
                    <SelectItem value="FUEL">{t('expenses.catFuel')}</SelectItem>
                    <SelectItem value="MISC">{t('expenses.catMisc')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ex-note">{t('expenses.fieldNote')}</Label>
                <Textarea
                  id="ex-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ex-rcpt">{t('expenses.fieldReceipt')}</Label>
                <Input
                  id="ex-rcpt"
                  type="file"
                  accept="image/*"
                  required
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                />
                {receiptPreview ?
                  <p className="text-xs text-muted-foreground">
                    {t('expenses.receiptAttached')}
                  </p>
                : null}
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={saving} className="gap-1.5">
                  {saving ?
                    <Loader2 className="h-4 w-4 animate-spin" />
                  : <Receipt className="h-4 w-4" />}
                  {t('expenses.submit')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      : null}

      {/*
        STRICT ROLE-BASED EXPENSE DESIGN — Part 3 / Part 8 (defense in depth).

        The analytics dashboard renders totals, trends, percentages and
        insights ("expenses increased N%", "highest employee
        spending"). It is a FINANCIAL surface — branch managers must
        never see it, even if they manually enter the URL. The nav
        already excludes them (see `expenseReportsItem`); this guard
        is the second line of defense.
      */}
      {mode === 'reports' && user?.safariRole !== 'MANAGER' ?
        <ExpensesAnalyticsDashboard
          rows={rows ?? []}
          fromIso={from}
          toIso={to}
          branchId={selectedBranch !== 'ALL' ? selectedBranch : undefined}
        />
      : null}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <CardTitle className="text-base">{t('expenses.list')}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Input
              type="datetime-local"
              value={from.slice(0, 16)}
              onChange={(e) => {
                const nextFrom = new Date(e.target.value).toISOString();
                setFrom(nextFrom);
                updateFilterParams({ from: nextFrom });
              }}
              className="w-auto"
            />
            <Input
              type="datetime-local"
              value={to.slice(0, 16)}
              onChange={(e) => {
                const nextTo = new Date(e.target.value).toISOString();
                setTo(nextTo);
                updateFilterParams({ to: nextTo });
              }}
              className="w-auto"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ?
                <Loader2 className="h-4 w-4 animate-spin" />
              : null}
              {t('expenses.refresh')}
            </Button>
            {hasRole('OWNER', 'GENERAL_MANAGER') ? (
              <Select
                value={selectedBranch}
                onValueChange={(v) => {
                  const nextBranch = v ?? 'ALL';
                  setSelectedBranch(nextBranch);
                  updateFilterParams({ branchId: nextBranch });
                }}
              >
                <SelectTrigger className="min-w-[180px]">
                  <SelectValue placeholder="All branches">
                    {selectedBranch === 'ALL'
                      ? 'All branches'
                      : (branches.find((b) => b.id === selectedBranch)?.name ??
                        'All branches')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All branches</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {mode !== 'cars' ? (
              <Select
                value={expenseType}
                onValueChange={(v) => {
                  const nextType = v === 'car' ? 'car' : 'all';
                  setExpenseType(nextType);
                  updateFilterParams({ type: nextType });
                }}
              >
                <SelectTrigger className="min-w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('expenses.typeAll')}</SelectItem>
                  <SelectItem value="car">{t('expenses.typeCar')}</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                const nextStatus = v as ExpenseStatusFilter;
                setStatusFilter(nextStatus);
                updateFilterParams({ status: nextStatus });
              }}
            >
              <SelectTrigger className="min-w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="PENDING_ACCOUNTANT">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="AUDIT">Audit</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading && !rows ?
            <p className="text-sm text-muted-foreground">{t('expenses.loading')}</p>
          : rows && rows.length === 0 ?
            <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
              <p className="text-sm font-medium text-foreground">
                {mode === 'cars' || expenseType === 'car' ?
                  t('expenses.emptyCars')
                : t('expenses.empty')}
              </p>
            </div>
          : (
            <table className="safari-data-table min-w-[560px]">
              <thead>
                <tr>
                  <th>{t('expenses.colDate')}</th>
                  <th>{t('expenses.colTitle')}</th>
                  <th>{t('expenses.colCategory')}</th>
                  <th>Status</th>
                  <th>Branch</th>
                  <th>{t('expenses.colBy')}</th>
                  <th className="text-end">{t('expenses.colAmount')}</th>
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-muted-foreground">
                      {new Date(r.expenseDate).toLocaleString(dateLocale)}
                    </td>
                    <td className="safari-table-primary max-w-[220px] whitespace-normal">
                      {r.title}
                    </td>
                    <td>{r.category}</td>
                    <td>
                      <span className={expenseWorkflowChipClass(r.status)}>
                        {r.status.replaceAll('_', ' ')}
                      </span>
                    </td>
                    <td>{r.branch?.name ?? '—'}</td>
                    <td>{r.recordedBy.fullName}</td>
                    <td className="text-end font-semibold tabular-nums">
                      {formatKwdLabel(r.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

