import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw, Upload, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { RequireRoles } from '@/modules/shared/components/require-roles';
import {
  ApiError,
  apiJson,
  getDeposits,
  uploadDriverDeposit,
  type DepositAuditRow,
  type ExpenseRow,
  type OrderRow,
} from '@/lib/api';
import { Button } from '@/modules/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';

function MyDepositsContent() {
  const { token } = useAuth();
  const [rows, setRows] = useState<DepositAuditRow[]>([]);
  const [availableCash, setAvailableCash] = useState(0);
  const [pendingDebt, setPendingDebt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [type] = useState<'CASH'>('CASH');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [data, orders, expenses] = await Promise.all([
        getDeposits(token),
        apiJson<OrderRow[]>('/api/orders', { token }),
        apiJson<ExpenseRow[]>(`/api/expenses?from=${encodeURIComponent('1970-01-01T00:00:00.000Z')}&to=${encodeURIComponent(new Date().toISOString())}`, { token }),
      ]);
      setRows(data.rows ?? []);

      const totalCashInvoices = (orders ?? [])
        .filter(
          (o) =>
            o.status === 'COMPLETED' &&
            o.cashStatus === 'PAID_TO_DRIVER' &&
            o.posPaymentMethod === 'CASH',
        )
        .reduce((sum, o) => sum + Number.parseFloat(o.totalPrice || '0'), 0);

      const totalExpenses = (expenses ?? [])
        .filter((e) => e.status === 'APPROVED' || e.status === 'AUDIT')
        .reduce((sum, e) => sum + Number.parseFloat(e.amount || '0'), 0);

      const debtTotal = (orders ?? [])
        .filter(
          (o) =>
            o.status === 'COMPLETED' &&
            o.posPaymentMethod === 'DEBT_ON_ACCOUNT',
        )
        .reduce((sum, o) => sum + Number.parseFloat(o.totalPrice || '0'), 0);

      setAvailableCash(totalCashInvoices - totalExpenses);
      setPendingDebt(debtTotal);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    if (!token || !file) {
      toast.error('Choose a receipt file');
      return;
    }
    const n = Number.parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setSubmitting(true);
    try {
      await uploadDriverDeposit(token, { file, type, amount: n });
      toast.success('Deposit request submitted');
      setAmount('');
      setFile(null);
      await load();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-2 py-4 sm:px-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">My deposits</h1>
        <p className="text-sm text-muted-foreground">
          Submit bank or K-Net deposit proof. Status updates after accountant review.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <Card className="border-emerald-300 bg-emerald-50">
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-xs font-semibold text-emerald-800">كاش متوفر</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-emerald-900">
                {availableCash.toFixed(3)} KWD
              </p>
            </div>
            <Wallet className="h-8 w-8 text-emerald-700" />
          </CardContent>
        </Card>
        <Card className="border-red-300 bg-red-50">
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-xs font-semibold text-red-800">مديونيات معلقة</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-red-900">
                {pendingDebt.toFixed(3)} KWD
              </p>
            </div>
            <AlertCircle className="h-8 w-8 text-red-700" />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>New deposit request</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Type</Label>
              <select
                className="h-10 w-full rounded-md border px-3"
                value={type}
                disabled
              >
                <option value="CASH">CASH</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Amount (KWD)</Label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0000"
                inputMode="decimal"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Receipt (image or PDF)</Label>
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Button type="button" className="min-h-12" disabled={submitting} onClick={() => void submit()}>
            {submitting ?
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
            : <Upload className="me-2 h-4 w-4" />}
            Submit
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Your requests</CardTitle>
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
            {loading ?
              <Loader2 className="h-4 w-4 animate-spin" />
            : <RefreshCw className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ?
            <p className="text-sm text-muted-foreground">Loading…</p>
          : rows.length === 0 ?
            <p className="text-sm text-muted-foreground">No deposits yet.</p>
          : rows.map((r) => (
              <div key={r.id} className="rounded-lg border p-3 text-sm">
                <div className="flex justify-between gap-2 font-medium">
                  <span>{r.type}</span>
                  <span className="tabular-nums">{r.amount} KWD</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {r.type} · {r.status} · {new Date(r.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function MyDepositsPage() {
  return (
    <RequireRoles roles={['DRIVER']}>
      <MyDepositsContent />
    </RequireRoles>
  );
}
