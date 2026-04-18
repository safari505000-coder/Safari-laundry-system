import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, PackagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { useSafariStream } from '@/contexts/safari-stream-context';
import {
  ApiError,
  apiJson,
  listInventoryCategories,
  listStockItems,
  listSuppliers,
  recordStockIn,
  type BranchRow,
  type InventoryCategoryRow,
  type StockItemRow,
  type SupplierRow,
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
import { Textarea } from '@/modules/shared/components/ui/textarea';

const SUPPLIER_NEW = '__new__';

/**
 * Accountant-only Stock-In form (Dastur §2 Accountant → §4 Stock-In).
 * Fields: Item / Branch / Qty / Unit Cost / Supplier (pick existing or create
 * new) / Reference / Note. Submits to POST /api/inventory/stock-in which
 * atomically creates the STOCK_IN movement, increments the branch level, and
 * recomputes the moving-average unit cost.
 */
export default function AccountantStockInPage() {
  const { t, i18n } = useTranslation();
  const { token, user, hasRole } = useAuth();
  const { refresh: refreshStream } = useSafariStream();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [items, setItems] = useState<StockItemRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [categories, setCategories] = useState<InventoryCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [stockItemId, setStockItemId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [supplierMode, setSupplierMode] = useState<string>(SUPPLIER_NEW);
  const [supplierName, setSupplierName] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  const isArabic = i18n.language?.startsWith('ar');
  const pickName = (ar: string, en: string | null) => (isArabic ? ar : en || ar);

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      try {
        const [it, br, sup, cats] = await Promise.all([
          listStockItems(token),
          apiJson<BranchRow[]>('/api/branches', { token }),
          listSuppliers(token),
          listInventoryCategories(token),
        ]);
        setItems(it.filter((x) => x.isActive));
        setBranches(br.filter((b) => b.isActive));
        setSuppliers(sup.filter((s) => s.isActive));
        setCategories(cats);

        const preItem = params.get('itemId');
        const preBranch = params.get('branchId');
        if (preItem && it.some((x) => x.id === preItem)) setStockItemId(preItem);
        if (preBranch && br.some((b) => b.id === preBranch)) setBranchId(preBranch);
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, params]);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === stockItemId) ?? null,
    [items, stockItemId],
  );

  const allowed = hasRole('ACCOUNTANT');
  if (!allowed) return <Navigate to="/" replace />;
  if (!token || !user) return null;

  const canSubmit =
    !submitting &&
    stockItemId.length > 0 &&
    branchId.length > 0 &&
    Number(quantity) > 0 &&
    Number(unitCost) >= 0 &&
    (supplierMode !== SUPPLIER_NEW || supplierName.trim().length > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const qty = Number(quantity);
    const cost = Number(unitCost);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error(t('inventory.stockIn.invalidQty'));
      return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      toast.error(t('inventory.stockIn.invalidCost'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await recordStockIn(token!, {
        stockItemId,
        branchId,
        quantity: qty,
        unitCost: cost,
        supplierId:
          supplierMode === SUPPLIER_NEW ? undefined : supplierMode,
        supplierName:
          supplierMode === SUPPLIER_NEW ? supplierName.trim() : undefined,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      });
      toast.success(
        t('inventory.stockIn.success', {
          qty: res.newQuantityOnHand,
          avg: res.newAvgUnitCost,
        }),
      );
      setQuantity('');
      setUnitCost('');
      setReference('');
      setNote('');
      if (supplierMode === SUPPLIER_NEW) {
        setSupplierName('');
        const refreshed = await listSuppliers(token!);
        setSuppliers(refreshed.filter((s) => s.isActive));
      }
      void refreshStream();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error(t('inventory.stockIn.failed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <PackagePlus className="h-6 w-6" aria-hidden />
            {t('inventory.stockIn.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('inventory.stockIn.subtitle')}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={() => navigate('/accountant/inventory')}
        >
          <ArrowLeft className="h-4 w-4" />
          {t('inventory.stockIn.backToReport')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t('inventory.stockIn.formTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <form onSubmit={submit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2">
                <Label>{t('inventory.stockIn.item')}</Label>
                <Select value={stockItemId} onValueChange={(v) => setStockItemId(v ?? '')}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('inventory.stockIn.itemPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((it) => {
                      const cat = categories.find((c) => c.id === it.categoryId);
                      return (
                        <SelectItem key={it.id} value={it.id}>
                          {pickName(it.nameAr, it.nameEn)}
                          <span className="ms-2 text-xs text-muted-foreground">
                            {it.code} · {it.unit}
                            {cat ? ` · ${pickName(cat.nameAr, cat.nameEn)}` : ''}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {selectedItem?.lastUnitCost ? (
                  <p className="text-xs text-muted-foreground">
                    {t('inventory.stockIn.lastCostHint', {
                      cost: Number(selectedItem.lastUnitCost).toFixed(3),
                    })}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label>{t('inventory.stockIn.branch')}</Label>
                <Select value={branchId} onValueChange={(v) => setBranchId(v ?? '')}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('inventory.stockIn.branchPlaceholder')} />
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

              <div className="space-y-1.5">
                <Label>
                  {t('inventory.stockIn.quantity')}
                  {selectedItem ? ` (${selectedItem.unit})` : ''}
                </Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.001"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0"
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t('inventory.stockIn.unitCostKd')}</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.001"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  placeholder="0.000"
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t('inventory.stockIn.reference')}</Label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={t('inventory.stockIn.referencePlaceholder')}
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label>{t('inventory.stockIn.supplier')}</Label>
                <Select value={supplierMode} onValueChange={(v) => setSupplierMode(v ?? SUPPLIER_NEW)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SUPPLIER_NEW}>
                      {t('inventory.stockIn.newSupplier')}
                    </SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {supplierMode === SUPPLIER_NEW ? (
                  <Input
                    className="mt-2"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder={t('inventory.stockIn.newSupplierPlaceholder')}
                  />
                ) : null}
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label>{t('inventory.stockIn.note')}</Label>
                <Textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('inventory.stockIn.notePlaceholder')}
                />
              </div>

              <div className="md:col-span-2 flex justify-end gap-2">
                <Button type="submit" disabled={!canSubmit} className="gap-2">
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PackagePlus className="h-4 w-4" />
                  )}
                  {t('inventory.stockIn.submit')}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
