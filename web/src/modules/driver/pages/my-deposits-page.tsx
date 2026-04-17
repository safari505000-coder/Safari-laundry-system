import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { RequireRoles } from '@/modules/shared/components/require-roles';
import { ApiError, getDeposits, uploadDriverDeposit, type DepositAuditRow } from '@/lib/api';
import { Button } from '@/modules/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';

function MyDepositsContent() {
  const { token } = useAuth();
  const [rows, setRows] = useState<DepositAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'CASH' | 'KNET'>('CASH');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await getDeposits(token);
      setRows(data.rows ?? []);
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
                onChange={(e) => setType(e.target.value as 'CASH' | 'KNET')}
              >
                <option value="CASH">CASH</option>
                <option value="KNET">KNET</option>
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
