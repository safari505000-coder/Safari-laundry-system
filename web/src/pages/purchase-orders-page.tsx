import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  FileText,
  PackageCheck,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Truck,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import { notify } from '@/lib/notify';
import {
  apiJson,
  cancelPurchaseOrder,
  createPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  listStockItems,
  listSuppliers,
  receivePurchaseOrder,
  sendPurchaseOrder,
  type BranchRow,
  type CreatePurchaseOrderBody,
  type PurchaseOrderDetail,
  type PurchaseOrderListRow,
  type PurchaseOrderStatus,
  type ReceivePurchaseOrderBody,
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/shared/components/ui/dialog';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/shared/components/ui/select';
import { StatTile } from '@/modules/shared/components/ui/stat-tile';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';
import { TableBodySkeleton } from '@/modules/shared/components/ui/skeleton-helpers';
import { Textarea } from '@/modules/shared/components/ui/textarea';

const ANY = '__any__';

const STATUS_META: Record<
  PurchaseOrderStatus,
  { ar: string; className: string }
> = {
  DRAFT: {
    ar: 'مسودة',
    className:
      'bg-muted text-foreground border border-border dark:bg-muted/70',
  },
  SENT: {
    ar: 'مرسل للمورد',
    className:
      'bg-sky-100 text-sky-950 border border-sky-300 dark:bg-sky-950/40 dark:text-sky-100 dark:border-sky-800/60',
  },
  PARTIALLY_RECEIVED: {
    ar: 'استلام جزئي',
    className:
      'bg-amber-100 text-amber-950 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-800/60',
  },
  RECEIVED: {
    ar: 'تم الاستلام',
    className:
      'bg-emerald-100 text-emerald-950 border border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-100 dark:border-emerald-800/60',
  },
  CANCELLED: {
    ar: 'ملغى',
    className:
      'bg-rose-100 text-rose-950 border border-rose-300 dark:bg-rose-950/40 dark:text-rose-100 dark:border-rose-800/60',
  },
};

type DraftLine = {
  stockItemId: string;
  quantityOrdered: string;
  unitCost: string;
};

const EMPTY_DRAFT_LINE: DraftLine = {
  stockItemId: '',
  quantityOrdered: '1',
  unitCost: '0.000',
};

/**
 * Stage-F Cosmetic — Purchase Orders.
 *
 * One screen that does three jobs so the GM/Accountant doesn't have to
 * context-switch:
 *   1. List view with status filter.
 *   2. "Create PO" dialog (supplier + branch + line items).
 *   3. "Detail" dialog with send/cancel/receive actions.
 * Managers see the list read-only (they need to know what's arriving).
 */
export default function PurchaseOrdersPage() {
  const { token, user } = useAuth();
  const canCreate = can(user, 'purchaseOrders.create');
  const canSend = can(user, 'purchaseOrders.send');
  const canCancel = can(user, 'purchaseOrders.cancel');
  const canReceive = can(user, 'purchaseOrders.receive');

  const [rows, setRows] = useState<PurchaseOrderListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<PurchaseOrderStatus | typeof ANY>(ANY);

  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [items, setItems] = useState<StockItemRow[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PurchaseOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);

  // ─── List load ────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await listPurchaseOrders(token, {
        status: status === ANY ? undefined : status,
        limit: 200,
      });
      setRows(res.rows);
    } catch (e) {
      notify.error(e);
    } finally {
      setLoading(false);
    }
  }, [token, status]);

  useEffect(() => {
    void load();
  }, [load]);

  // ─── Ref data (on mount) ──────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const [br, sup, it] = await Promise.all([
          apiJson<BranchRow[]>('/api/branches', { token }),
          listSuppliers(token),
          listStockItems(token),
        ]);
        setBranches(br.filter((b) => b.isActive));
        setSuppliers(sup.filter((s) => s.isActive));
        setItems(it.filter((i) => i.isActive));
      } catch (e) {
        notify.error(e);
      }
    })();
  }, [token]);

  // ─── Detail load ──────────────────────────────────────────────────
  const loadDetail = useCallback(
    async (id: string) => {
      if (!token) return;
      setDetailLoading(true);
      try {
        const d = await getPurchaseOrder(token, id);
        setDetail(d);
      } catch (e) {
        notify.error(e);
      } finally {
        setDetailLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (detailId) void loadDetail(detailId);
    else setDetail(null);
  }, [detailId, loadDetail]);

  // ─── Actions ──────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!token || !detail) return;
    try {
      const updated = await sendPurchaseOrder(token, detail.id);
      setDetail(updated);
      notify.success(`تم إرسال ${updated.poNumber} إلى المورد`);
      void load();
    } catch (e) {
      notify.error(e);
    }
  };

  const handleCancel = async () => {
    if (!token || !detail) return;
    const reason = window.prompt('سبب الإلغاء (اختياري)') ?? undefined;
    try {
      const updated = await cancelPurchaseOrder(token, detail.id, reason);
      setDetail(updated);
      notify.success(`تم إلغاء ${updated.poNumber}`);
      void load();
    } catch (e) {
      notify.error(e);
    }
  };

  // Totals
  const totals = useMemo(() => {
    const byStatus: Record<PurchaseOrderStatus, number> = {
      DRAFT: 0,
      SENT: 0,
      PARTIALLY_RECEIVED: 0,
      RECEIVED: 0,
      CANCELLED: 0,
    };
    let totalKd = 0;
    for (const r of rows) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      totalKd += Number(r.totalKd);
    }
    return { byStatus, totalKd };
  }, [rows]);

  if (!token) return null;

  return (
    <div className="space-y-5 p-4">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <FileText className="h-6 w-6 text-primary" />
            طلبات الشراء
          </h1>
          <p className="text-sm text-muted-foreground">
            إصدار طلبات الشراء للموردين، متابعة الاستلام الجزئي والكلي، وربط
            الاستلام تلقائياً بالمخزون.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw
              className={`ms-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`}
            />
            تحديث
          </Button>
          {canCreate ? (
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="ms-1 h-4 w-4" />
              طلب جديد
            </Button>
          ) : null}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="إجمالي الطلبات"
          value={rows.length.toString()}
          tone="primary"
          size="compact"
        />
        <StatTile
          label="مسودة"
          value={(totals.byStatus.DRAFT ?? 0).toString()}
          size="compact"
        />
        <StatTile
          label="في الطريق (مرسل / جزئي)"
          value={(
            (totals.byStatus.SENT ?? 0) +
            (totals.byStatus.PARTIALLY_RECEIVED ?? 0)
          ).toString()}
          tone="warning"
          size="compact"
        />
        <StatTile
          label="تم الاستلام"
          value={(totals.byStatus.RECEIVED ?? 0).toString()}
          tone="success"
          size="compact"
        />
        <StatTile
          label="إجمالي قيمة الطلبات"
          value={`${totals.totalKd.toFixed(3)} د.ك`}
          tone="primary"
          size="compact"
          mono
        />
      </section>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-base font-bold text-foreground">
            قائمة الطلبات
          </CardTitle>
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">
              تصفية بالحالة
            </Label>
            <Select
              value={status}
              onValueChange={(v) =>
                setStatus(v as PurchaseOrderStatus | typeof ANY)
              }
            >
              <SelectTrigger className="h-9 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>الكل</SelectItem>
                {(Object.keys(STATUS_META) as PurchaseOrderStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_META[s].ar}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رقم الطلب</TableHead>
                  <TableHead>المورد</TableHead>
                  <TableHead>الفرع</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-end">الإجمالي</TableHead>
                  <TableHead className="text-end">نسبة الاستلام</TableHead>
                  <TableHead className="whitespace-nowrap">
                    تاريخ الإنشاء
                  </TableHead>
                  <TableHead className="text-end">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableBodySkeleton columns={8} rows={5} />
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      لا توجد طلبات لعرضها.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setDetailId(r.id)}
                    >
                      <TableCell className="font-semibold tabular-nums">
                        {r.poNumber}
                      </TableCell>
                      <TableCell>{r.supplierName}</TableCell>
                      <TableCell>{r.branchName}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_META[r.status].className}`}
                        >
                          {STATUS_META[r.status].ar}
                        </span>
                      </TableCell>
                      <TableCell className="text-end font-mono tabular-nums">
                        {Number(r.totalKd).toFixed(3)} د.ك
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {Math.round(r.receivedRatio * 100)}%
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString('en-GB')}
                      </TableCell>
                      <TableCell className="text-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailId(r.id);
                          }}
                        >
                          عرض
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <CreatePoDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        suppliers={suppliers}
        branches={branches}
        items={items}
        busy={createBusy}
        onSubmit={async (body) => {
          if (!token) return;
          setCreateBusy(true);
          try {
            const created = await createPurchaseOrder(token, body);
            notify.success(`تم إنشاء الطلب ${created.poNumber}`);
            setCreateOpen(false);
            void load();
            setDetailId(created.id);
          } catch (e) {
            notify.error(e);
          } finally {
            setCreateBusy(false);
          }
        }}
      />

      {/* Detail dialog */}
      <Dialog
        open={detailId != null}
        onOpenChange={(o) => {
          if (!o) {
            setDetailId(null);
            setReceiveOpen(false);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          {detail ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between gap-3">
                  <span className="font-mono">{detail.poNumber}</span>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${STATUS_META[detail.status].className}`}
                  >
                    {STATUS_META[detail.status].ar}
                  </span>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <StatTile
                    label="المورد"
                    value={detail.supplierName}
                    size="compact"
                  />
                  <StatTile
                    label="الفرع"
                    value={detail.branchName}
                    size="compact"
                  />
                  <StatTile
                    label="الإجمالي"
                    value={`${detail.totalKd} د.ك`}
                    mono
                    tone="primary"
                    size="compact"
                  />
                </div>

                {detail.notes ? (
                  <p className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                    {detail.notes}
                  </p>
                ) : null}

                <div>
                  <h4 className="mb-2 text-sm font-semibold text-foreground">
                    البنود
                  </h4>
                  <div className="overflow-x-auto rounded-md border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>الصنف</TableHead>
                          <TableHead className="text-end">المطلوب</TableHead>
                          <TableHead className="text-end">المستلم</TableHead>
                          <TableHead className="text-end">السعر</TableHead>
                          <TableHead className="text-end">الإجمالي</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.lines.map((l) => (
                          <TableRow key={l.id}>
                            <TableCell>
                              <div className="font-medium">{l.stockItemName}</div>
                              <div className="text-xs text-muted-foreground">
                                {l.stockItemCode} — {l.unit}
                              </div>
                            </TableCell>
                            <TableCell className="text-end tabular-nums">
                              {Number(l.quantityOrdered).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-end tabular-nums">
                              {Number(l.quantityReceived).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-end font-mono tabular-nums">
                              {Number(l.unitCost).toFixed(3)}
                            </TableCell>
                            <TableCell className="text-end font-mono tabular-nums">
                              {Number(l.lineTotal).toFixed(3)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {detail.receipts.length > 0 ? (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-foreground">
                      سجل الاستلام
                    </h4>
                    <ul className="space-y-2">
                      {detail.receipts.map((r) => (
                        <li
                          key={r.id}
                          className="rounded-md border border-border bg-muted/30 p-3 text-sm"
                        >
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              {new Date(r.receivedAt).toLocaleString('en-GB')}
                            </span>
                            <span>بواسطة: {r.receivedByName}</span>
                          </div>
                          <ul className="mt-2 space-y-1">
                            {r.lines.map((rl) => (
                              <li
                                key={rl.id}
                                className="flex items-center justify-between gap-2"
                              >
                                <span>{rl.stockItemName}</span>
                                <span className="tabular-nums">
                                  {Number(rl.quantityReceived).toFixed(2)} ×{' '}
                                  {Number(rl.unitCost).toFixed(3)}
                                </span>
                              </li>
                            ))}
                          </ul>
                          {r.note ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              {r.note}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {detail.cancelledReason ? (
                  <p className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-950 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-100">
                    سبب الإلغاء: {detail.cancelledReason}
                  </p>
                ) : null}
              </div>

              <DialogFooter className="flex flex-wrap items-center gap-2">
                {canSend && detail.status === 'DRAFT' ? (
                  <Button type="button" onClick={handleSend}>
                    <Send className="ms-1 h-4 w-4" />
                    إرسال للمورد
                  </Button>
                ) : null}
                {canReceive &&
                (detail.status === 'SENT' ||
                  detail.status === 'PARTIALLY_RECEIVED') ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setReceiveOpen(true)}
                  >
                    <PackageCheck className="ms-1 h-4 w-4" />
                    تسجيل استلام
                  </Button>
                ) : null}
                {canCancel &&
                (detail.status === 'DRAFT' || detail.status === 'SENT') ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="text-rose-700 hover:bg-rose-50 dark:text-rose-200 dark:hover:bg-rose-950/40"
                    onClick={handleCancel}
                  >
                    <XCircle className="ms-1 h-4 w-4" />
                    إلغاء الطلب
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              {detailLoading ? 'جاري التحميل...' : '—'}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Receive dialog (nested when the detail is open) */}
      {detail ? (
        <ReceiveDialog
          open={receiveOpen}
          onClose={() => setReceiveOpen(false)}
          po={detail}
          onSubmit={async (body) => {
            if (!token) return;
            try {
              const updated = await receivePurchaseOrder(token, detail.id, body);
              setDetail(updated);
              setReceiveOpen(false);
              notify.success(`تم تسجيل الاستلام — ${updated.poNumber}`);
              void load();
            } catch (e) {
              notify.error(e);
            }
          }}
        />
      ) : null}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Create PO dialog
// ──────────────────────────────────────────────────────────────────────

function CreatePoDialog({
  open,
  onClose,
  suppliers,
  branches,
  items,
  busy,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  suppliers: SupplierRow[];
  branches: BranchRow[];
  items: StockItemRow[];
  busy: boolean;
  onSubmit: (body: CreatePurchaseOrderBody) => Promise<void>;
}) {
  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([{ ...EMPTY_DRAFT_LINE }]);
  const [expectedAt, setExpectedAt] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) {
      setSupplierId('');
      setBranchId('');
      setLines([{ ...EMPTY_DRAFT_LINE }]);
      setExpectedAt('');
      setNotes('');
    }
  }, [open]);

  const total = useMemo(() => {
    return lines.reduce((acc, l) => {
      const q = Number(l.quantityOrdered);
      const c = Number(l.unitCost);
      if (!Number.isFinite(q) || !Number.isFinite(c)) return acc;
      return acc + q * c;
    }, 0);
  }, [lines]);

  const handleSubmit = async () => {
    if (!supplierId || !branchId) {
      notify.warning('يرجى اختيار المورد والفرع');
      return;
    }
    const parsed = lines
      .filter((l) => l.stockItemId)
      .map((l) => ({
        stockItemId: l.stockItemId,
        quantityOrdered: Number(l.quantityOrdered),
        unitCost: Number(l.unitCost),
      }));
    if (parsed.length === 0) {
      notify.warning('يرجى إضافة بند واحد على الأقل');
      return;
    }
    for (const l of parsed) {
      if (!Number.isFinite(l.quantityOrdered) || l.quantityOrdered <= 0) {
        notify.warning('الكمية المطلوبة يجب أن تكون أكبر من صفر');
        return;
      }
      if (!Number.isFinite(l.unitCost) || l.unitCost < 0) {
        notify.warning('سعر الوحدة غير صحيح');
        return;
      }
    }
    await onSubmit({
      supplierId,
      branchId,
      lines: parsed,
      expectedAt: expectedAt ? new Date(expectedAt).toISOString() : undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>طلب شراء جديد</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label>المورد</Label>
              <Select value={supplierId} onValueChange={(v) => setSupplierId(v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر المورد">
                    {supplierId
                      ? (suppliers.find((s) => s.id === supplierId)?.name ??
                        'اختر المورد')
                      : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الفرع المستلم</Label>
              <Select value={branchId} onValueChange={(v) => setBranchId(v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الفرع">
                    {branchId
                      ? (branches.find((b) => b.id === branchId)?.name ??
                        'اختر الفرع')
                      : null}
                  </SelectValue>
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
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>البنود</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setLines((prev) => [...prev, { ...EMPTY_DRAFT_LINE }])
                }
              >
                <Plus className="ms-1 h-4 w-4" />
                بند
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 items-end gap-2 rounded-md border border-border p-2"
                >
                  <div className="col-span-12 sm:col-span-5">
                    <Label className="text-xs">الصنف</Label>
                    <Select
                      value={line.stockItemId}
                      onValueChange={(v) =>
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === idx ? { ...l, stockItemId: v ?? '' } : l,
                          ),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر صنف">
                          {line.stockItemId
                            ? (() => {
                                const it = items.find(
                                  (it) => it.id === line.stockItemId,
                                );
                                return it
                                  ? `${it.nameAr} (${it.code})`
                                  : 'اختر صنف';
                              })()
                            : null}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {items.map((it) => (
                          <SelectItem key={it.id} value={it.id}>
                            {it.nameAr} ({it.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-4 sm:col-span-3">
                    <Label className="text-xs">الكمية</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={line.quantityOrdered}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === idx
                              ? { ...l, quantityOrdered: e.target.value }
                              : l,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="col-span-5 sm:col-span-3">
                    <Label className="text-xs">سعر الوحدة (د.ك)</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.001"
                      value={line.unitCost}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === idx
                              ? { ...l, unitCost: e.target.value }
                              : l,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-rose-700 dark:text-rose-300"
                      onClick={() =>
                        setLines((prev) =>
                          prev.length > 1
                            ? prev.filter((_, i) => i !== idx)
                            : prev,
                        )
                      }
                      disabled={lines.length <= 1}
                      aria-label="حذف البند"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-end text-sm font-semibold tabular-nums">
              الإجمالي المقدّر: {total.toFixed(3)} د.ك
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label>تاريخ التسليم المتوقع</Label>
              <Input
                type="date"
                value={expectedAt}
                onChange={(e) => setExpectedAt(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>ملاحظات</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="اختياري"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={busy}>
            <CheckCircle2 className="ms-1 h-4 w-4" />
            {busy ? 'جاري الحفظ...' : 'حفظ كمسودة'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Receive dialog — record a partial/full delivery
// ──────────────────────────────────────────────────────────────────────

function ReceiveDialog({
  open,
  onClose,
  po,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  po: PurchaseOrderDetail;
  onSubmit: (body: ReceivePurchaseOrderBody) => Promise<void>;
}) {
  // Default: pre-fill each line with the remaining quantity (ordered − received).
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      const initial: Record<string, string> = {};
      for (const l of po.lines) {
        const remaining = Math.max(
          0,
          Number(l.quantityOrdered) - Number(l.quantityReceived),
        );
        initial[l.id] = remaining.toFixed(2);
      }
      setDraft(initial);
      setNote('');
    }
  }, [open, po.lines]);

  const handleSubmit = async () => {
    const payload: ReceivePurchaseOrderBody = {
      lines: Object.entries(draft)
        .map(([lineId, qtyStr]) => ({
          purchaseOrderLineId: lineId,
          quantityReceived: Number(qtyStr),
        }))
        .filter((x) => Number.isFinite(x.quantityReceived) && x.quantityReceived > 0),
      note: note.trim() || undefined,
    };
    if (payload.lines.length === 0) {
      notify.warning('لا توجد كميات للتسجيل');
      return;
    }
    await onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            تسجيل استلام — {po.poNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            أدخل الكمية المستلمة في هذه الدفعة فقط. يتم احتساب ما سبق استلامه
            وتحديث المخزون تلقائياً.
          </p>
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الصنف</TableHead>
                  <TableHead className="text-end">مطلوب</TableHead>
                  <TableHead className="text-end">مستلم سابقاً</TableHead>
                  <TableHead className="text-end">استلام الآن</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {po.lines.map((l) => {
                  const ordered = Number(l.quantityOrdered);
                  const received = Number(l.quantityReceived);
                  const remaining = Math.max(0, ordered - received);
                  return (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div className="font-medium">{l.stockItemName}</div>
                        <div className="text-xs text-muted-foreground">
                          {l.unit}
                        </div>
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {ordered.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {received.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-end">
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={remaining}
                          step="0.01"
                          value={draft[l.id] ?? ''}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              [l.id]: e.target.value,
                            }))
                          }
                          className="h-8 w-24 text-end tabular-nums"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div>
            <Label>ملاحظة الاستلام</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="رقم بوليصة الشحن، اسم السائق..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="button" onClick={handleSubmit}>
            <PackageCheck className="ms-1 h-4 w-4" />
            تأكيد الاستلام
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
