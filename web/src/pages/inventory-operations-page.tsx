import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ClipboardCheck,
  Loader2,
  PackageMinus,
  Sliders,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import {
  ApiError,
  apiJson,
  listStockItems,
  recordStockAdjustment,
  recordStockOut,
  recordStockTransfer,
  submitStocktake,
  type BranchRow,
  type StockItemRow,
  type StocktakeLinePayload,
} from '@/lib/api';
import { can } from '@/modules/shared/auth/access-matrix';
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/modules/shared/components/ui/tabs';
import { Textarea } from '@/modules/shared/components/ui/textarea';

/**
 * Unified operations workbench for Stage-E write flows. Grouping stock-out
 * (consumption), adjustment (breakage / write-off), and inter-branch
 * transfer into one page with tabs keeps the single "what did stock do
 * today" mental model tight and avoids sprinkling four disparate routes
 * across the sidebar. The stocktake screen lives on its own route because
 * its workflow is heavier (a whole sheet of lines).
 */
export default function InventoryOperationsPage() {
  const { token, user } = useAuth();
  const [items, setItems] = useState<StockItemRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      try {
        const [it, br] = await Promise.all([
          listStockItems(token),
          apiJson<BranchRow[]>('/api/branches', { token }),
        ]);
        setItems(it.filter((x) => x.isActive));
        setBranches(br.filter((b) => b.isActive));
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (!token) return null;
  const canOut = can(user, 'inventory.stockOut');
  const canAdj = can(user, 'inventory.adjust');
  const canTx = can(user, 'inventory.transfer');
  const canCount = can(user, 'inventory.stocktake');

  const initialTab = canOut
    ? 'out'
    : canAdj
      ? 'adjust'
      : canTx
        ? 'transfer'
        : 'count';

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-bold">عمليات المخزون</h1>
        <p className="text-sm text-muted-foreground">
          تسجيل استهلاك، تسويات، تحويلات بين الفروع، وجرد فعلي.
        </p>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <Tabs defaultValue={initialTab}>
          <TabsList className="grid w-full max-w-xl grid-cols-4">
            <TabsTrigger value="out" disabled={!canOut}>
              <PackageMinus className="me-2 h-4 w-4" />
              استهلاك
            </TabsTrigger>
            <TabsTrigger value="adjust" disabled={!canAdj}>
              <Sliders className="me-2 h-4 w-4" />
              تسوية
            </TabsTrigger>
            <TabsTrigger value="transfer" disabled={!canTx}>
              <ArrowLeftRight className="me-2 h-4 w-4" />
              تحويل
            </TabsTrigger>
            <TabsTrigger value="count" disabled={!canCount}>
              <ClipboardCheck className="me-2 h-4 w-4" />
              جرد
            </TabsTrigger>
          </TabsList>

          <TabsContent value="out">
            <StockOutForm token={token} items={items} branches={branches} />
          </TabsContent>
          <TabsContent value="adjust">
            <AdjustForm token={token} items={items} branches={branches} />
          </TabsContent>
          <TabsContent value="transfer">
            <TransferForm token={token} items={items} branches={branches} />
          </TabsContent>
          <TabsContent value="count">
            <StocktakeForm token={token} items={items} branches={branches} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

type CommonProps = {
  token: string;
  items: StockItemRow[];
  branches: BranchRow[];
};

function StockOutForm({ token, items, branches }: CommonProps) {
  const [stockItemId, setStockItemId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number(quantity);
    if (!stockItemId || !branchId || !Number.isFinite(qty) || qty <= 0) return;
    setBusy(true);
    try {
      const res = await recordStockOut(token, {
        stockItemId,
        branchId,
        quantity: qty,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      });
      toast.success(`تم تسجيل الاستهلاك. الرصيد الحالي: ${res.newQuantityOnHand}`);
      setQuantity('');
      setReference('');
      setNote('');
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">تسجيل استهلاك مخزون</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
          <ItemPicker value={stockItemId} onChange={setStockItemId} items={items} />
          <BranchPicker value={branchId} onChange={setBranchId} branches={branches} />
          <div className="space-y-1.5">
            <Label>الكمية</Label>
            <Input type="number" step="0.001" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>المرجع (اختياري)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="مثال: تنظيف قسم الإطارات" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>ملاحظة</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" disabled={busy} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageMinus className="h-4 w-4" />}
              تسجيل الاستهلاك
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function AdjustForm({ token, items, branches }: CommonProps) {
  const [stockItemId, setStockItemId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const d = Number(delta);
    if (!stockItemId || !branchId || !Number.isFinite(d) || d === 0 || !reason.trim()) return;
    setBusy(true);
    try {
      const res = await recordStockAdjustment(token, {
        stockItemId,
        branchId,
        delta: d,
        reason: reason.trim(),
        reference: reference.trim() || undefined,
      });
      toast.success(`تمت التسوية. الرصيد الحالي: ${res.newQuantityOnHand}`);
      setDelta('');
      setReason('');
      setReference('');
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">تسوية مخزون</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
          <ItemPicker value={stockItemId} onChange={setStockItemId} items={items} />
          <BranchPicker value={branchId} onChange={setBranchId} branches={branches} />
          <div className="space-y-1.5">
            <Label>
              الفارق <span className="text-muted-foreground text-xs">(سالب = خصم، موجب = إضافة)</span>
            </Label>
            <Input type="number" step="0.001" value={delta} onChange={(e) => setDelta(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>المرجع (اختياري)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>السبب (إلزامي)</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="كسر، انتهاء صلاحية، تصحيح جرد…" />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" disabled={busy || !reason.trim()} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sliders className="h-4 w-4" />}
              حفظ التسوية
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function TransferForm({ token, items, branches }: CommonProps) {
  const [stockItemId, setStockItemId] = useState('');
  const [fromBranchId, setFrom] = useState('');
  const [toBranchId, setTo] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number(quantity);
    if (!stockItemId || !fromBranchId || !toBranchId || fromBranchId === toBranchId || !Number.isFinite(qty) || qty <= 0) return;
    setBusy(true);
    try {
      const res = await recordStockTransfer(token, {
        stockItemId,
        fromBranchId,
        toBranchId,
        quantity: qty,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      });
      toast.success(
        `تم التحويل (${res.reference}). رصيد المصدر: ${res.out.newQuantityOnHand}، رصيد الوجهة: ${res.in.newQuantityOnHand}`,
      );
      setQuantity('');
      setReference('');
      setNote('');
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">تحويل بين الفروع</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <ItemPicker value={stockItemId} onChange={setStockItemId} items={items} />
          </div>
          <BranchPicker value={fromBranchId} onChange={setFrom} branches={branches} label="من فرع" />
          <BranchPicker value={toBranchId} onChange={setTo} branches={branches.filter((b) => b.id !== fromBranchId)} label="إلى فرع" />
          <div className="space-y-1.5">
            <Label>الكمية</Label>
            <Input type="number" step="0.001" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>المرجع (يُولّد تلقائياً لو فارغ)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>ملاحظة</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" disabled={busy || fromBranchId === toBranchId} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
              تنفيذ التحويل
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

type StocktakeEntry = { stockItemId: string; countedQuantity: string; note: string };

function StocktakeForm({ token, items, branches }: CommonProps) {
  const [branchId, setBranchId] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<StocktakeEntry[]>([
    { stockItemId: '', countedQuantity: '', note: '' },
  ]);
  const [busy, setBusy] = useState(false);

  const valid = useMemo(
    () =>
      branchId &&
      lines.length > 0 &&
      lines.every(
        (l) =>
          l.stockItemId &&
          Number.isFinite(Number(l.countedQuantity)) &&
          Number(l.countedQuantity) >= 0,
      ),
    [branchId, lines],
  );

  function updateLine(i: number, patch: Partial<StocktakeEntry>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      const payload: StocktakeLinePayload[] = lines.map((l) => ({
        stockItemId: l.stockItemId,
        countedQuantity: Number(l.countedQuantity),
        note: l.note.trim() || undefined,
      }));
      const res = await submitStocktake(token, {
        branchId,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
        lines: payload,
      });
      toast.success(
        `تم الجرد (${res.reference}) · ${res.adjustedLines}/${res.totalLines} سطر عدّل.`,
      );
      setLines([{ stockItemId: '', countedQuantity: '', note: '' }]);
      setReference('');
      setNote('');
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">جرد فعلي</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <BranchPicker value={branchId} onChange={setBranchId} branches={branches} />
            <div className="space-y-1.5">
              <Label>المرجع</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="مثال: جرد Q1-2026" />
            </div>
            <div className="space-y-1.5">
              <Label>ملاحظة عامة</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid gap-2 rounded border p-2 md:grid-cols-12">
                <div className="md:col-span-6">
                  <ItemPicker
                    value={l.stockItemId}
                    onChange={(v) => updateLine(i, { stockItemId: v })}
                    items={items}
                    compact
                  />
                </div>
                <Input
                  className="md:col-span-2"
                  type="number"
                  step="0.001"
                  min={0}
                  value={l.countedQuantity}
                  onChange={(e) => updateLine(i, { countedQuantity: e.target.value })}
                  placeholder="المعدودة"
                />
                <Input
                  className="md:col-span-3"
                  value={l.note}
                  onChange={(e) => updateLine(i, { note: e.target.value })}
                  placeholder="ملاحظة السطر"
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="md:col-span-1 text-rose-600"
                  onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                  disabled={lines.length === 1}
                >
                  حذف
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setLines((ls) => [...ls, { stockItemId: '', countedQuantity: '', note: '' }])
              }
            >
              + إضافة سطر
            </Button>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={busy || !valid} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
              اعتماد الجرد
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ItemPicker({
  value,
  onChange,
  items,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  items: StockItemRow[];
  compact?: boolean;
}) {
  return (
    <div className={compact ? '' : 'space-y-1.5'}>
      {compact ? null : <Label>الصنف</Label>}
      <Select value={value} onValueChange={(v) => onChange(v ?? '')}>
        <SelectTrigger>
          <SelectValue placeholder="اختر صنفاً" />
        </SelectTrigger>
        <SelectContent>
          {items.map((it) => (
            <SelectItem key={it.id} value={it.id}>
              {it.nameAr} · {it.code} ({it.unit})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function BranchPicker({
  value,
  onChange,
  branches,
  label = 'الفرع',
}: {
  value: string;
  onChange: (v: string) => void;
  branches: BranchRow[];
  label?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? '')}>
        <SelectTrigger>
          <SelectValue placeholder="اختر فرعاً" />
        </SelectTrigger>
        <SelectContent>
          {branches.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
