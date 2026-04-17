import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Plus, Receipt } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { type ExpenseRow, apiJson, ApiError } from '@/lib/api';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import { formatKwdLabel } from '@/lib/kwd';
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

/** Driver fuel / misc field expenses (pending accountant review). */
export function DriverFieldExpensesPage() {
  const { t } = useTranslation();
  const dateLocale = useAppLocale();
  const { token, hasRole } = useAuth();
  const [from, setFrom] = useState(() => startOfDayIso(new Date()));
  const [to, setTo] = useState(() => endOfDayIso(new Date()));
  const [rows, setRows] = useState<ExpenseRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<'FUEL' | 'MISC' | 'SOAP'>('FUEL');
  const [note, setNote] = useState('');
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);

  if (!hasRole('DRIVER')) return <Navigate to="/" replace />;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ from, to });
      const data = await apiJson<ExpenseRow[]>(`/api/expenses?${qs.toString()}`, {
        token,
      });
      setRows(
        Array.isArray(data) ?
          data.filter((row) => row && typeof row.id === 'string' && row.id.length > 0)
        : [],
      );
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const n = Number.parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error(t('expenses.invalidAmount'));
      return;
    }
    setSaving(true);
    try {
      await apiJson<ExpenseRow>('/api/expenses', {
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

  return (
    <div className="mx-auto max-w-lg space-y-4 px-1 pb-8 md:max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
          {t('driverFieldExpenses.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('driverFieldExpenses.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4" />
            {t('expenses.new')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="df-title">{t('expenses.fieldTitle')}</Label>
              <Input
                id="df-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={200}
                className="h-11"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="df-amt">{t('expenses.fieldAmount')}</Label>
                <Input
                  id="df-amt"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('expenses.fieldCategory')}</Label>
                <Select
                  value={category}
                  onValueChange={(v) => setCategory(v as 'FUEL' | 'MISC' | 'SOAP')}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FUEL">{t('expenses.catFuel')}</SelectItem>
                    <SelectItem value="MISC">{t('expenses.catRepair')}</SelectItem>
                    <SelectItem value="SOAP">{t('expenses.catOther')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="df-note">{t('expenses.fieldNote')}</Label>
              <Textarea
                id="df-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="df-rcpt">{t('expenses.fieldReceipt')}</Label>
              <Input
                id="df-rcpt"
                type="file"
                accept="image/*"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
              {receiptPreview ?
                <p className="text-xs text-muted-foreground">{t('expenses.receiptAttached')}</p>
              : null}
            </div>
            <Button
              type="submit"
              disabled={saving}
              className="h-11 w-full gap-1.5"
            >
              {saving ?
                <Loader2 className="h-4 w-4 animate-spin" />
              : <Receipt className="h-4 w-4" />}
              {t('expenses.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2">
          <CardTitle className="text-base">{t('expenses.list')}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Input
              type="datetime-local"
              value={from.slice(0, 16)}
              onChange={(e) => setFrom(new Date(e.target.value).toISOString())}
              className="h-10 w-auto min-w-0 flex-1"
            />
            <Input
              type="datetime-local"
              value={to.slice(0, 16)}
              onChange={(e) => setTo(new Date(e.target.value).toISOString())}
              className="h-10 w-auto min-w-0 flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-10"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ?
                <Loader2 className="h-4 w-4 animate-spin" />
              : null}
              {t('expenses.refresh')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && !rows ?
            <p className="text-sm text-muted-foreground">{t('expenses.loading')}</p>
          : rows && rows.length === 0 ?
            <p className="text-sm text-muted-foreground">{t('expenses.empty')}</p>
          : (
            <div className="space-y-2">
              {(rows ?? []).map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{r.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.expenseDate).toLocaleString(dateLocale)} · {r.category} ·{' '}
                      {r.status}
                    </p>
                  </div>
                  <span className="tabular-nums font-semibold">{formatKwdLabel(r.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
