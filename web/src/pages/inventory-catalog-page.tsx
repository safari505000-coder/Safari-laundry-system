import { useEffect, useMemo, useState } from 'react';
import { Loader2, Package, Plus, Tag, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import {
  ApiError,
  createInventoryCategory,
  createStockItem,
  createSupplier,
  listInventoryCategories,
  listStockItems,
  listSuppliers,
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/modules/shared/components/ui/tabs';

const NO_CATEGORY = '__none__';

/**
 * Dastur §4 — unified inventory catalog maintenance for the Accountant
 * (and read-only for OWNER/GM). Three tabs in one screen keep the catalog
 * work co-located: stock items, categories, and suppliers. Every form
 * posts to the matching POST endpoint and refreshes the list in place.
 */
export default function InventoryCatalogPage() {
  const { token, hasRole } = useAuth();
  const [items, setItems] = useState<StockItemRow[]>([]);
  const [categories, setCategories] = useState<InventoryCategoryRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const canManage = hasRole('ACCOUNTANT');

  // Item form state
  const [iCode, setICode] = useState('');
  const [iName, setIName] = useState('');
  const [iNameEn, setINameEn] = useState('');
  const [iUnit, setIUnit] = useState('pcs');
  const [iCategory, setICategory] = useState<string>(NO_CATEGORY);
  const [iReorder, setIReorder] = useState('0');
  const [iBusy, setIBusy] = useState(false);

  // Category form state
  const [cCode, setCCode] = useState('');
  const [cName, setCName] = useState('');
  const [cNameEn, setCNameEn] = useState('');
  const [cSort, setCSort] = useState('0');
  const [cBusy, setCBusy] = useState(false);

  // Supplier form state
  const [sName, setSName] = useState('');
  const [sPhone, setSPhone] = useState('');
  const [sAddress, setSAddress] = useState('');
  const [sBusy, setSBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    void reload(token);
  }, [token]);

  async function reload(t: string) {
    setLoading(true);
    try {
      const [it, cats, sup] = await Promise.all([
        listStockItems(t),
        listInventoryCategories(t),
        listSuppliers(t),
      ]);
      setItems(it);
      setCategories(cats);
      setSuppliers(sup);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  const categoryLookup = useMemo(() => {
    const m = new Map<string, InventoryCategoryRow>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  async function submitItem(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setIBusy(true);
    try {
      await createStockItem(token, {
        code: iCode.trim(),
        nameAr: iName.trim(),
        nameEn: iNameEn.trim() || null,
        unit: iUnit.trim() || 'pcs',
        categoryId: iCategory === NO_CATEGORY ? null : iCategory,
        reorderPointDefault: Number(iReorder) || 0,
      });
      toast.success('تم إنشاء الصنف');
      setICode('');
      setIName('');
      setINameEn('');
      setIReorder('0');
      setICategory(NO_CATEGORY);
      await reload(token);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setIBusy(false);
    }
  }

  async function submitCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setCBusy(true);
    try {
      await createInventoryCategory(token, {
        code: cCode.trim(),
        nameAr: cName.trim(),
        nameEn: cNameEn.trim() || null,
        sortOrder: Number(cSort) || 0,
      });
      toast.success('تم إنشاء الفئة');
      setCCode('');
      setCName('');
      setCNameEn('');
      setCSort('0');
      await reload(token);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setCBusy(false);
    }
  }

  async function submitSupplier(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSBusy(true);
    try {
      await createSupplier(token, {
        name: sName.trim(),
        phone: sPhone.trim() || undefined,
        address: sAddress.trim() || undefined,
      });
      toast.success('تم إنشاء المورد');
      setSName('');
      setSPhone('');
      setSAddress('');
      await reload(token);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSBusy(false);
    }
  }

  if (!token) return null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Package className="h-6 w-6" aria-hidden />
          كتالوج المخزون
        </h1>
        <p className="text-sm text-muted-foreground">
          إدارة الأصناف، الفئات، والموردين في مكان واحد.
        </p>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <Tabs defaultValue="items">
          <TabsList className="grid w-full max-w-xl grid-cols-3">
            <TabsTrigger value="items">
              <Package className="me-2 h-4 w-4" />
              الأصناف ({items.length})
            </TabsTrigger>
            <TabsTrigger value="categories">
              <Tag className="me-2 h-4 w-4" />
              الفئات ({categories.length})
            </TabsTrigger>
            <TabsTrigger value="suppliers">
              <Truck className="me-2 h-4 w-4" />
              الموردون ({suppliers.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="items" className="space-y-4">
            {canManage ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">إضافة صنف جديد</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={submitItem} className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label>الرمز</Label>
                      <Input value={iCode} onChange={(e) => setICode(e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label>الاسم (عربي)</Label>
                      <Input value={iName} onChange={(e) => setIName(e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label>الاسم (إنجليزي)</Label>
                      <Input value={iNameEn} onChange={(e) => setINameEn(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>الوحدة</Label>
                      <Input value={iUnit} onChange={(e) => setIUnit(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>الفئة</Label>
                      <Select value={iCategory} onValueChange={(v) => setICategory(v ?? NO_CATEGORY)}>
                        <SelectTrigger>
                          <SelectValue placeholder="— بدون فئة —">
                            {iCategory === NO_CATEGORY
                              ? '— بدون فئة —'
                              : (categories.find((c) => c.id === iCategory)
                                  ?.nameAr ?? '— بدون فئة —')}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_CATEGORY}>— بدون فئة —</SelectItem>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nameAr}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>نقطة إعادة الطلب</Label>
                      <Input
                        type="number"
                        step="0.001"
                        value={iReorder}
                        onChange={(e) => setIReorder(e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-3 flex justify-end">
                      <Button type="submit" disabled={iBusy || !iCode || !iName} className="gap-2">
                        {iBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        إضافة الصنف
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr className="text-start">
                        <th className="p-3 text-start">الرمز</th>
                        <th className="p-3 text-start">الاسم</th>
                        <th className="p-3 text-start">الفئة</th>
                        <th className="p-3 text-start">الوحدة</th>
                        <th className="p-3 text-start">نقطة الطلب</th>
                        <th className="p-3 text-start">آخر تكلفة</th>
                        <th className="p-3 text-start">نشط</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => (
                        <tr key={it.id} className="border-t">
                          <td className="p-3 font-mono tabular-nums">{it.code}</td>
                          <td className="p-3">{it.nameAr}</td>
                          <td className="p-3">
                            {it.categoryId ? categoryLookup.get(it.categoryId)?.nameAr ?? '—' : '—'}
                          </td>
                          <td className="p-3">{it.unit}</td>
                          <td className="p-3 tabular-nums">{it.reorderPointDefault}</td>
                          <td className="p-3 tabular-nums">{it.lastUnitCost ?? '—'}</td>
                          <td className="p-3">{it.isActive ? '✓' : '×'}</td>
                        </tr>
                      ))}
                      {items.length === 0 ? (
                        <tr>
                          <td className="p-6 text-center text-muted-foreground" colSpan={7}>
                            لا توجد أصناف بعد.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categories" className="space-y-4">
            {canManage ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">إضافة فئة جديدة</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={submitCategory} className="grid gap-3 md:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label>الرمز</Label>
                      <Input value={cCode} onChange={(e) => setCCode(e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label>الاسم (عربي)</Label>
                      <Input value={cName} onChange={(e) => setCName(e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label>الاسم (إنجليزي)</Label>
                      <Input value={cNameEn} onChange={(e) => setCNameEn(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>الترتيب</Label>
                      <Input type="number" value={cSort} onChange={(e) => setCSort(e.target.value)} />
                    </div>
                    <div className="md:col-span-4 flex justify-end">
                      <Button type="submit" disabled={cBusy || !cCode || !cName} className="gap-2">
                        {cBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        إضافة الفئة
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="p-3 text-start">الرمز</th>
                        <th className="p-3 text-start">الاسم</th>
                        <th className="p-3 text-start">الترتيب</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map((c) => (
                        <tr key={c.id} className="border-t">
                          <td className="p-3 font-mono tabular-nums">{c.code}</td>
                          <td className="p-3">{c.nameAr}</td>
                          <td className="p-3 tabular-nums">{c.sortOrder}</td>
                        </tr>
                      ))}
                      {categories.length === 0 ? (
                        <tr>
                          <td className="p-6 text-center text-muted-foreground" colSpan={3}>
                            لا توجد فئات بعد.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="suppliers" className="space-y-4">
            {canManage ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">إضافة مورّد جديد</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={submitSupplier} className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label>الاسم</Label>
                      <Input value={sName} onChange={(e) => setSName(e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label>الهاتف</Label>
                      <Input value={sPhone} onChange={(e) => setSPhone(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>العنوان</Label>
                      <Input value={sAddress} onChange={(e) => setSAddress(e.target.value)} />
                    </div>
                    <div className="md:col-span-3 flex justify-end">
                      <Button type="submit" disabled={sBusy || !sName} className="gap-2">
                        {sBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        إضافة المورّد
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="p-3 text-start">الاسم</th>
                        <th className="p-3 text-start">الهاتف</th>
                        <th className="p-3 text-start">العنوان</th>
                        <th className="p-3 text-start">نشط</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suppliers.map((s) => (
                        <tr key={s.id} className="border-t">
                          <td className="p-3">{s.name}</td>
                          <td className="p-3 font-mono tabular-nums">{s.phone ?? '—'}</td>
                          <td className="p-3">{s.address ?? '—'}</td>
                          <td className="p-3">{s.isActive ? '✓' : '×'}</td>
                        </tr>
                      ))}
                      {suppliers.length === 0 ? (
                        <tr>
                          <td className="p-6 text-center text-muted-foreground" colSpan={4}>
                            لا يوجد موردون بعد.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
