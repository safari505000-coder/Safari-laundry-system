import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, History, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import {
  ApiError,
  apiJson,
  exportStockMovementsXlsx,
  listStockItems,
  listStockMovements,
  type BranchRow,
  type ListStockMovementsFilters,
  type StockItemRow,
  type StockMovementRow,
  type StockMovementType,
} from '@/lib/api';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/shared/components/ui/select';

const ANY = '__any__';

const TYPE_LABELS: Record<StockMovementType, string> = {
  STOCK_IN: 'استلام',
  STOCK_OUT: 'استهلاك',
  ADJUSTMENT: 'تسوية',
  TRANSFER_IN: 'تحويل داخل',
  TRANSFER_OUT: 'تحويل خارج',
};

const TYPE_CLASSES: Record<StockMovementType, string> = {
  STOCK_IN: 'bg-emerald-100 text-emerald-900',
  STOCK_OUT: 'bg-rose-100 text-rose-900',
  ADJUSTMENT: 'bg-amber-100 text-amber-900',
  TRANSFER_IN: 'bg-sky-100 text-sky-900',
  TRANSFER_OUT: 'bg-indigo-100 text-indigo-900',
};

const kwDt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kuwait',
  dateStyle: 'short',
  timeStyle: 'short',
});

/**
 * Dastur §4 — full stock-movement audit. Filters mirror the backend
 * `ListMovementsQueryDto` (branch, item, type, date range, limit). The
 * Excel export reuses the same filter payload so whatever the auditor
 * sees on screen is what they download.
 */
export default function InventoryMovementsPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<StockItemRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [rows, setRows] = useState<StockMovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [branchId, setBranchId] = useState<string>(ANY);
  const [stockItemId, setStockItemId] = useState<string>(ANY);
  const [type, setType] = useState<string>(ANY);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState('100');

  const filters = useMemo<ListStockMovementsFilters>(() => {
    const n = Number(limit);
    return {
      branchId: branchId === ANY ? undefined : branchId,
      stockItemId: stockItemId === ANY ? undefined : stockItemId,
      type: type === ANY ? undefined : (type as StockMovementType),
      from: from || undefined,
      to: to || undefined,
      limit: Number.isFinite(n) && n > 0 ? n : 100,
    };
  }, [branchId, stockItemId, type, from, to, limit]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await listStockMovements(token, filters);
      setRows(res);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, filters]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const [it, br] = await Promise.all([
          listStockItems(token),
          apiJson<BranchRow[]>('/api/branches', { token }),
        ]);
        setItems(it);
        setBranches(br);
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
      }
    })();
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onExport() {
    if (!token) return;
    setExporting(true);
    try {
      await exportStockMovementsXlsx(token, filters);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setExporting(false);
    }
  }

  if (!token) return null;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <History className="h-6 w-6" aria-hidden />
            سجل حركات المخزون
          </h1>
          <p className="text-sm text-muted-foreground">
            كل قيد دخول، استهلاك، تسوية، أو تحويل بين الفروع — موثّق بالوقت والمستخدم.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            تحديث
          </Button>
          <Button onClick={() => void onExport()} disabled={exporting || loading} className="gap-2">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            تصدير Excel
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">المرشّحات</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-6">
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
            <div className="space-y-1.5 md:col-span-2">
              <Label>الصنف</Label>
              <Select value={stockItemId} onValueChange={(v) => setStockItemId(v ?? ANY)}>
                <SelectTrigger>
                  <SelectValue placeholder="الكل">
                    {stockItemId === ANY
                      ? 'الكل'
                      : (() => {
                          const it = items.find((i) => i.id === stockItemId);
                          return it ? `${it.nameAr} · ${it.code}` : 'الكل';
                        })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>الكل</SelectItem>
                  {items.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.nameAr} · {i.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>النوع</Label>
              <Select value={type} onValueChange={(v) => setType(v ?? ANY)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>الكل</SelectItem>
                  {(Object.keys(TYPE_LABELS) as StockMovementType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>من</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>إلى</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>الحد الأقصى</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-3 text-start">التاريخ</th>
                    <th className="p-3 text-start">النوع</th>
                    <th className="p-3 text-start">الصنف</th>
                    <th className="p-3 text-start">الفرع</th>
                    <th className="p-3 text-start">الكمية</th>
                    <th className="p-3 text-start">تكلفة الوحدة</th>
                    <th className="p-3 text-start">الإجمالي</th>
                    <th className="p-3 text-start">المورد</th>
                    <th className="p-3 text-start">المرجع</th>
                    <th className="p-3 text-start">بواسطة</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id} className="border-t align-top">
                      <td className="p-3 tabular-nums whitespace-nowrap">
                        {kwDt.format(new Date(m.createdAt))}
                      </td>
                      <td className="p-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${TYPE_CLASSES[m.type]}`}>
                          {TYPE_LABELS[m.type]}
                        </span>
                      </td>
                      <td className="p-3">
                        <div>{m.stockItem.nameAr}</div>
                        <div className="text-xs text-muted-foreground">
                          {m.stockItem.code} · {m.stockItem.unit}
                        </div>
                      </td>
                      <td className="p-3">{m.branchName}</td>
                      <td className="p-3 tabular-nums">{m.quantity}</td>
                      <td className="p-3 tabular-nums">{m.unitCost ?? '—'}</td>
                      <td className="p-3 tabular-nums">{m.totalCost ?? '—'}</td>
                      <td className="p-3">{m.supplierName ?? '—'}</td>
                      <td className="p-3 font-mono text-xs">{m.reference ?? '—'}</td>
                      <td className="p-3 text-xs">{m.recordedBy?.fullName ?? '—'}</td>
                    </tr>
                  ))}
                  {rows.length === 0 ? (
                    <tr>
                      <td className="p-6 text-center text-muted-foreground" colSpan={10}>
                        لا حركات مطابقة للمرشحات.
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
