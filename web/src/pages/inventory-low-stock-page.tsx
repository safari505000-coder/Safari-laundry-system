import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { notify } from '@/lib/notify';
import {
  apiJson,
  getLowStock,
  type BranchRow,
  type LowStockResponse,
} from '@/lib/api';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
import { Label } from '@/modules/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/shared/components/ui/select';
import { TableSkeleton } from '@/modules/shared/components/ui/skeleton-helpers';

const ANY = '__any__';

const STATUS_CLASSES: Record<'LOW_STOCK' | 'OUT_OF_STOCK', string> = {
  LOW_STOCK: 'bg-amber-100 text-amber-900',
  OUT_OF_STOCK: 'bg-rose-100 text-rose-900',
};
const STATUS_LABEL: Record<'LOW_STOCK' | 'OUT_OF_STOCK', string> = {
  LOW_STOCK: 'منخفض',
  OUT_OF_STOCK: 'نافد',
};

/**
 * Dastur §4 — live low-stock & out-of-stock view. The nightly cron writes
 * the audited snapshot, but operations often needs the instantaneous
 * picture after a big stock-out event, hence the live endpoint here.
 */
export default function InventoryLowStockPage() {
  const { token } = useAuth();
  const [data, setData] = useState<LowStockResponse | null>(null);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchId, setBranchId] = useState<string>(ANY);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await getLowStock(token, branchId === ANY ? undefined : branchId);
      setData(res);
    } catch (e) {
      notify.error(e);
    } finally {
      setLoading(false);
    }
  }, [token, branchId]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const br = await apiJson<BranchRow[]>('/api/branches', { token });
        setBranches(br.filter((b) => b.isActive));
      } catch (e) {
        notify.error(e);
      }
    })();
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!token) return null;
  const rows = data?.rows ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <AlertTriangle className="h-6 w-6 text-amber-600" aria-hidden />
            تنبيهات المخزون المنخفض
          </h1>
          <p className="text-sm text-muted-foreground">
            كل فرع/صنف تحت أو عند نقطة إعادة الطلب. العدّ لحظي.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          تحديث
        </Button>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryStat label="إجمالي التنبيهات" value={data?.summary.total ?? 0} tone="slate" />
        <SummaryStat label="نافد" value={data?.summary.outOfStock ?? 0} tone="rose" />
        <SummaryStat label="منخفض" value={data?.summary.lowStock ?? 0} tone="amber" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">المرشّحات</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>الفرع</Label>
              <Select value={branchId} onValueChange={(v) => setBranchId(v ?? ANY)}>
                <SelectTrigger>
                  <SelectValue placeholder="الكل">
                    {branchId === ANY
                      ? 'الكل'
                      : (branches.find((b) => b.id === branchId)?.name ?? 'الكل')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>الكل</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-3">
              <TableSkeleton rows={6} columns={5} withHeader={false} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-3 text-start">الحالة</th>
                    <th className="p-3 text-start">الصنف</th>
                    <th className="p-3 text-start">الفرع</th>
                    <th className="p-3 text-start">الرصيد</th>
                    <th className="p-3 text-start">نقطة إعادة الطلب</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.stockItemId}-${r.branchId}`} className="border-t">
                      <td className="p-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASSES[r.status]}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                      </td>
                      <td className="p-3">
                        <div>{r.nameAr}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.code} · {r.unit}
                        </div>
                      </td>
                      <td className="p-3">{r.branchName}</td>
                      <td className="p-3 tabular-nums">{r.quantityOnHand}</td>
                      <td className="p-3 tabular-nums">{r.reorderPoint}</td>
                    </tr>
                  ))}
                  {rows.length === 0 ? (
                    <tr>
                      <td className="p-6 text-center text-muted-foreground" colSpan={5}>
                        لا تنبيهات حالياً — كل الأصناف فوق نقطة إعادة الطلب.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'slate' | 'rose' | 'amber';
}) {
  const cls =
    tone === 'rose'
      ? 'bg-rose-50 text-rose-900 border-rose-200'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-900 border-amber-200'
        : 'bg-slate-50 text-slate-900 border-slate-200';
  return (
    <Card className={cls}>
      <CardContent className="pt-4">
        <p className="text-xs opacity-80">{label}</p>
        <p className="text-3xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
