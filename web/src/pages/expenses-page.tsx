import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Plus, Receipt } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import {
  API_EXPENSES,
  type BranchRow,
  type ExpenseRow,
  apiJson,
  ApiError,
} from '@/lib/api';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
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

export function ExpensesPage() {
  const { t } = useTranslation();
  const dateLocale = useAppLocale();
  const { token, user, hasRole, ownerBranchId } = useAuth();
  const [from, setFrom] = useState(() => startOfDayIso(new Date()));
  const [to, setTo] = useState(() => endOfDayIso(new Date()));
  const [rows, setRows] = useState<ExpenseRow[] | null>(null);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'PENDING_ACCOUNTANT' | 'APPROVED' | 'REJECTED' | 'AUDIT'
  >('ALL');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<'SOAP' | 'FUEL' | 'MISC'>('MISC');
  const [note, setNote] = useState('');
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);

  const canManage = can(user, 'expenses.record');
  const canView = can(user, 'expenses.view');

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
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, from, to, ownerBranchId, selectedBranch, statusFilter]);

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
          {t('expenses.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('expenses.subtitle')}</p>
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

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <CardTitle className="text-base">{t('expenses.list')}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Input
              type="datetime-local"
              value={from.slice(0, 16)}
              onChange={(e) =>
                setFrom(new Date(e.target.value).toISOString())
              }
              className="w-auto"
            />
            <Input
              type="datetime-local"
              value={to.slice(0, 16)}
              onChange={(e) => setTo(new Date(e.target.value).toISOString())}
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
                onValueChange={(v) => setSelectedBranch(v ?? 'ALL')}
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
            <Select
              value={statusFilter}
              onValueChange={(v) =>
                setStatusFilter(
                  v as
                    | 'ALL'
                    | 'PENDING_ACCOUNTANT'
                    | 'APPROVED'
                    | 'REJECTED'
                    | 'AUDIT',
                )
              }
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
            <p className="text-sm text-muted-foreground">{t('expenses.empty')}</p>
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

