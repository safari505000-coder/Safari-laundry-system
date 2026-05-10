import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/shared/components/ui/dialog';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';
import { useAuth } from '@/contexts/auth-context';
import { chartScalarFromKwdString } from '@/lib/kwd';
import { can } from '@/modules/shared/auth/access-matrix';
import {
  ApiError,
  apiJson,
  editInvoiceSameDay,
  voidInvoice,
  type EditInvoiceBody,
  type EditInvoiceLineItemInput,
  type OrderRow,
} from '@/lib/api';

/**
 * Minimal shape the supervisor actions need. Callers may pass a full
 * OrderRow, a CustomerLedgerInvoice, or any ad-hoc shape as long as
 * `id`, `createdAtIso`, `status`, `totalKd` are present.
 */
export type InvoiceSupervisorTarget = {
  id: string;
  createdAtIso: string;
  status: string;
  totalKd: string;
  paymentMethod?: EditInvoiceBody['posPaymentMethod'] | null;
  notes?: string | null;
};

type Props = {
  order: InvoiceSupervisorTarget;
  onChanged?: () => void;
  compact?: boolean;
};

/**
 * V19.9 — Compact edit/void launcher shown on each invoice row for a
 * CALL_CENTER_SUPERVISOR. The Edit button is hidden for orders issued
 * on an earlier Kuwait-local day (same-day window only). Void is
 * available as long as the order is not already CANCELED.
 */
export function InvoiceSupervisorActions({
  order,
  onChanged,
  compact,
}: Props) {
  const { user } = useAuth();
  const canEdit = can(user, 'invoices.editSameDay');
  const canVoid = can(user, 'invoices.void');
  const [confirmEditOpen, setConfirmEditOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);

  const isSameDay = useMemo(() => {
    const d1 = new Date(order.createdAtIso);
    const d2 = new Date();
    const fmt = (d: Date) => {
      const kuwait = new Date(d.getTime() + 3 * 60 * 60 * 1000);
      return kuwait.toISOString().slice(0, 10);
    };
    return fmt(d1) === fmt(d2);
  }, [order.createdAtIso]);

  const alreadyCanceled = order.status === 'CANCELED';

  if (!canEdit && !canVoid) return null;
  if (alreadyCanceled) {
    if (compact) return null;
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30">
        هذه الفاتورة ملغية — لا يمكن التعديل عليها.
      </div>
    );
  }

  const size = compact ? 'icon' : 'sm';

  return (
    <div className="flex flex-wrap gap-1">
      {canEdit ? (
        <Button
          variant="outline"
          size={size}
          onClick={(e) => {
            e.stopPropagation();
            setConfirmEditOpen(true);
          }}
          disabled={!isSameDay}
          title={
            !isSameDay
              ? 'التعديل مسموح في نفس اليوم فقط'
              : 'تعديل الفاتورة'
          }
          className={compact ? 'h-8 w-8' : 'gap-1'}
        >
          <Pencil className="h-3.5 w-3.5" />
          {compact ? null : <span>تعديل</span>}
        </Button>
      ) : null}
      {canVoid ? (
        <Button
          variant="destructive"
          size={size}
          onClick={(e) => {
            e.stopPropagation();
            setVoidOpen(true);
          }}
          title="إلغاء الفاتورة"
          className={compact ? 'h-8 w-8' : 'gap-1'}
        >
          <XCircle className="h-3.5 w-3.5" />
          {compact ? null : <span>إلغاء الفاتورة</span>}
        </Button>
      ) : null}

      <ConfirmEditDialog
        open={confirmEditOpen}
        onOpenChange={setConfirmEditOpen}
        onConfirm={() => {
          setConfirmEditOpen(false);
          setEditOpen(true);
        }}
      />
      <EditInvoiceDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        order={order}
        onChanged={onChanged}
      />
      <VoidInvoiceDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        order={order}
        onChanged={onChanged}
      />
    </div>
  );
}

/**
 * V19.9.2 — Pre-flight confirmation before the supervisor lands on
 * the edit form. Surfaces the accounting impact up front so nobody
 * opens the editor by accident. Kept as a small, focused dialog so
 * the main edit dialog stays dedicated to the form itself.
 */
function ConfirmEditDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5" />
            تنبيه قبل تعديل الفاتورة
          </DialogTitle>
          <DialogDescription className="mt-2 text-start text-sm leading-relaxed">
            أنت على وشك فتح نافذة تعديل الفاتورة. أي تغيير تقوم بحفظه
            <b className="mx-1">يؤثر مباشرة</b> على الحسابات المالية:
          </DialogDescription>
        </DialogHeader>

        <ul className="mt-1 list-disc space-y-1.5 ps-5 text-sm text-foreground">
          <li>
            سيتم قيد محاسبي <b>عكسي</b> للمبلغ الأصلي ثم قيد جديد بالمبلغ
            المعدَّل في دفتر الأستاذ العام.
          </li>
          <li>
            إذا كانت الفاتورة <b>آجل</b> أو <b>من محفظة الاشتراك</b>،
            ستُعاد المديونية/الرصيد ثم تُخصم بالرقم الجديد.
          </li>
          <li>
            التعديل مسموح <b>في نفس يوم الإصدار فقط</b>.
          </li>
          <li>
            كل التغييرات (قبل/بعد) تُحفظ دائماً في{' '}
            <b>سجل التدقيق</b> ويراها الأونر والمدير العام والمحاسب.
          </li>
        </ul>

        <div className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          هل تريد المتابعة لفتح نافذة التعديل؟
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={onConfirm} className="min-w-28">
            متابعة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditInvoiceDialog({
  open,
  onOpenChange,
  order,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: InvoiceSupervisorTarget;
  onChanged?: () => void;
}) {
  const { token } = useAuth();

  type LineDraft = {
    /** Local-only id so React can key rows even before persistence. */
    rowKey: string;
    /** Persisted DB id; undefined for freshly added rows. */
    id?: string;
    label: string;
    quantity: string;
    unitPrice: string;
    starchOption: 'NONE' | 'STARCH_25';
  };

  const [lines, setLines] = useState<LineDraft[] | null>(null);
  const [originalCount, setOriginalCount] = useState(0);
  const [posPaymentMethod, setPosPaymentMethod] = useState<
    EditInvoiceBody['posPaymentMethod'] | ''
  >(order.paymentMethod ?? '');
  const [notes, setNotes] = useState(order.notes ?? '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingLines, setLoadingLines] = useState(false);

  // Pull the authoritative line items fresh from the backend each
  // time the dialog opens — the caller only passes a minimal shape
  // (id, total, method) so we can't derive lines from it, and the
  // cached Customer 360 payload may be stale.
  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    setLoadingLines(true);
    apiJson<OrderRow>(`/api/orders/${order.id}`, { token })
      .then((full) => {
        if (cancelled) return;
        const drafts: LineDraft[] = full.lineItems.map((li, idx) => ({
          rowKey: li.id ?? `row-${idx}`,
          id: li.id,
          label: li.label ?? '',
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          starchOption:
            (li.starchOption as 'NONE' | 'STARCH_25' | undefined) ?? 'NONE',
        }));
        setLines(drafts);
        setOriginalCount(drafts.length);
        setPosPaymentMethod(full.posPaymentMethod ?? '');
        setNotes(full.notes ?? '');
        setReason('');
      })
      .catch((e) => {
        if (cancelled) return;
        toast.error(
          e instanceof ApiError ? e.message : 'تعذّر تحميل تفاصيل الفاتورة',
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingLines(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, order.id, token]);

  // V25 — @V24-LEGACY-MATH exemption: this is a live in-dialog line editor.
  // The supervisor types quantity/unitPrice per line; computedTotal shows a
  // real-time preview before submit. The server recomputes the authoritative
  // total on POST and rejects mismatches — this math is PREVIEW-ONLY and
  // never feeds downstream state or a displayed "current invoice total".
  const computedTotal = useMemo(() => {
    if (!lines) return 0;
    return lines.reduce((sum, r) => {
      const q = Number.parseFloat(r.quantity) || 0;
      const u = Number.parseFloat(r.unitPrice) || 0;
      return sum + q * u;
    }, 0);
  }, [lines]);

  const updateLine = (rowKey: string, patch: Partial<LineDraft>) => {
    setLines((prev) =>
      prev
        ? prev.map((r) => (r.rowKey === rowKey ? { ...r, ...patch } : r))
        : prev,
    );
  };

  const deleteLine = (rowKey: string) => {
    setLines((prev) => (prev ? prev.filter((r) => r.rowKey !== rowKey) : prev));
  };

  const addLine = () => {
    setLines((prev) => [
      ...(prev ?? []),
      {
        rowKey: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label: '',
        quantity: '1',
        unitPrice: '0',
        starchOption: 'NONE',
      },
    ]);
  };

  const submit = async () => {
    if (!token || !lines) return;
    // Validate every row before hitting the API — the backend rejects
    // negative values, but catching here keeps the audit log clean.
    for (const r of lines) {
      const q = Number.parseFloat(r.quantity);
      const u = Number.parseFloat(r.unitPrice);
      if (!Number.isFinite(q) || q < 0) {
        toast.error('الكمية غير صحيحة في أحد الأصناف.');
        return;
      }
      if (!Number.isFinite(u) || u < 0) {
        toast.error('سعر الوحدة غير صحيح في أحد الأصناف.');
        return;
      }
    }

    const body: EditInvoiceBody = {};
    const lineItems: EditInvoiceLineItemInput[] = lines.map((r) => ({
      id: r.id,
      label: r.label || undefined,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      starchOption: r.starchOption,
    }));
    body.lineItems = lineItems;
    if (posPaymentMethod && posPaymentMethod !== order.paymentMethod) {
      body.posPaymentMethod = posPaymentMethod || undefined;
    }
    if (notes !== (order.notes ?? '')) body.notes = notes;
    if (reason.trim()) body.reason = reason.trim();

    setSaving(true);
    try {
      await editInvoiceSameDay(token, order.id, body);
      toast.success('تم حفظ التعديل وتسجيله في سجل التدقيق.');
      onChanged?.();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'فشل حفظ التعديل';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const fmtKd = (n: number) =>
    n.toLocaleString('en-GB', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    });

  // V23.1 — `chartScalarFromKwdString` is the canonical RENDERING-ONLY
  // escape hatch used here to compute a UI-side delta indicator (red/green
  // chip + "+ X.XXX" label). The result never participates in any further
  // money math — the delta is computed once for display, then discarded.
  const originalTotalNum = chartScalarFromKwdString(order.totalKd);
  const delta = computedTotal - originalTotalNum;
  const hasDelta = Math.abs(delta) > 0.0005;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 p-0">
        {/* Header */}
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Pencil className="h-4 w-4 text-primary" />
            تعديل الفاتورة
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs">
            التعديل مسموح فقط في نفس يوم الإصدار — الإجمالي يُحتسب تلقائياً
            من مجموع الأصناف.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
          {loadingLines || !lines ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Warning banner — prominent accounting notice */}
              <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="space-y-1 text-xs leading-relaxed">
                  <p className="font-semibold">
                    تنبيه: التعديل يؤثر على الدفاتر المحاسبية والمحفظة
                  </p>
                  <ul className="list-disc space-y-0.5 ps-4">
                    <li>
                      سيتم قيد محاسبي <b>عكسي للمبلغ الأصلي</b> ثم قيد جديد
                      بالمبلغ المعدَّل في دفتر الأستاذ العام.
                    </li>
                    <li>
                      إذا كانت الفاتورة <b>آجل</b> أو <b>من محفظة الاشتراك</b>،
                      ستُعاد المديونية/الرصيد ثم تُخصم مرة أخرى بالرقم الجديد.
                    </li>
                    <li>
                      كل التغييرات تُحفظ بشكل دائم في{' '}
                      <b>سجل التدقيق</b> ويراها الأونر والمدير العام والمحاسب.
                    </li>
                  </ul>
                </div>
              </div>

              {/* Line items table */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    الأصناف{' '}
                    <span className="text-xs font-normal text-muted-foreground">
                      ({lines.length})
                    </span>
                  </h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addLine}
                    className="h-8 gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    إضافة صنف
                  </Button>
                </div>
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full border-collapse text-xs">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="w-10 px-2 py-2 text-center font-medium">
                          #
                        </th>
                        <th className="px-2 py-2 text-start font-medium">
                          وصف الصنف
                        </th>
                        <th className="w-24 px-2 py-2 text-center font-medium">
                          الكمية
                        </th>
                        <th className="w-28 px-2 py-2 text-center font-medium">
                          سعر الوحدة
                        </th>
                        <th className="w-28 px-2 py-2 text-center font-medium">
                          الإجمالي
                        </th>
                        <th className="w-10 px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="py-8 text-center text-muted-foreground"
                          >
                            لا توجد أصناف — اضغط «إضافة صنف» لبدء فاتورة جديدة.
                          </td>
                        </tr>
                      ) : (
                        lines.map((r, idx) => {
                          const q = Number.parseFloat(r.quantity) || 0;
                          const u = Number.parseFloat(r.unitPrice) || 0;
                          const lineTotal = q * u;
                          const isNew = !r.id;
                          return (
                            <tr
                              key={r.rowKey}
                              className={`border-t ${
                                isNew ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : ''
                              }`}
                            >
                              <td className="px-2 py-1.5 text-center text-muted-foreground tabular-nums">
                                {idx + 1}
                              </td>
                              <td className="px-2 py-1.5">
                                <Input
                                  value={r.label}
                                  onChange={(e) =>
                                    updateLine(r.rowKey, {
                                      label: e.target.value,
                                    })
                                  }
                                  placeholder={
                                    isNew ? 'صنف جديد…' : 'وصف الصنف'
                                  }
                                  className="h-8 text-xs"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <Input
                                  value={r.quantity}
                                  onChange={(e) =>
                                    updateLine(r.rowKey, {
                                      quantity: e.target.value,
                                    })
                                  }
                                  inputMode="decimal"
                                  className="h-8 text-center text-xs tabular-nums"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <Input
                                  value={r.unitPrice}
                                  onChange={(e) =>
                                    updateLine(r.rowKey, {
                                      unitPrice: e.target.value,
                                    })
                                  }
                                  inputMode="decimal"
                                  className="h-8 text-center text-xs tabular-nums"
                                />
                              </td>
                              <td className="px-2 py-1.5 text-center text-sm font-semibold tabular-nums">
                                {fmtKd(lineTotal)}
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                  onClick={() => deleteLine(r.rowKey)}
                                  title="حذف الصنف"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Total summary with delta */}
              <div className="rounded-lg border bg-muted/30 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">
                      الإجمالي الأصلي:
                    </span>
                    <span className="tabular-nums">
                      {fmtKd(originalTotalNum)} د.ك
                    </span>
                    <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">الجديد:</span>
                    <span className="text-base font-bold tabular-nums text-primary">
                      {fmtKd(computedTotal)} د.ك
                    </span>
                  </div>
                  {hasDelta ? (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold tabular-nums ${
                        delta > 0
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                          : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'
                      }`}
                    >
                      {delta > 0 ? '+' : ''}
                      {fmtKd(delta)} د.ك
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                      بدون تغيير بالإجمالي
                    </span>
                  )}
                </div>
              </div>

              {/* Payment method + notes */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">بيانات الدفع</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="pm" className="text-xs">
                      طريقة الدفع
                    </Label>
                    <select
                      id="pm"
                      value={posPaymentMethod}
                      onChange={(e) =>
                        setPosPaymentMethod(
                          e.target.value as EditInvoiceBody['posPaymentMethod'],
                        )
                      }
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">(بدون تغيير)</option>
                      <option value="CASH">نقداً</option>
                      <option value="KNET">كي نت</option>
                      <option value="PAYMENT_LINK">رابط دفع</option>
                      <option value="DEBT_ON_ACCOUNT">آجل (مديونية)</option>
                      <option value="SUBSCRIPTION_WALLET">
                        من محفظة الاشتراك
                      </option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="notes" className="text-xs">
                      ملاحظات
                    </Label>
                    <Input
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="اختياري"
                      className="h-9"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="reason" className="text-xs">
                    سبب التعديل{' '}
                    <span className="text-muted-foreground">
                      (يظهر في سجل التدقيق)
                    </span>
                  </Label>
                  <Input
                    id="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="مثال: تصحيح كمية خاطئة / إضافة صنف منسي"
                    className="h-9"
                  />
                </div>
              </section>

              {/* Change summary badges */}
              {originalCount > 0 && lines.length !== originalCount ? (
                <div className="flex flex-wrap gap-2 text-xs">
                  {lines.length > originalCount ? (
                    <span className="rounded-md bg-emerald-100 px-2 py-1 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                      + إضافة {lines.length - originalCount} صنف جديد
                    </span>
                  ) : null}
                  {lines.length < originalCount ? (
                    <span className="rounded-md bg-rose-100 px-2 py-1 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">
                      − حذف {originalCount - lines.length} صنف
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            إلغاء
          </Button>
          <Button
            onClick={submit}
            disabled={saving || loadingLines || !lines}
            className="min-w-32"
          >
            {saving ? 'جارٍ الحفظ…' : 'حفظ التعديل'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VoidInvoiceDialog({
  open,
  onOpenChange,
  order,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: InvoiceSupervisorTarget;
  onChanged?: () => void;
}) {
  const { token } = useAuth();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!token) return;
    if (reason.trim().length < 5) {
      toast.error('السبب مطلوب ولا يقل عن 5 أحرف.');
      return;
    }
    setSaving(true);
    try {
      await voidInvoice(token, order.id, reason.trim());
      toast.success('تم إلغاء الفاتورة وإرجاع الرصيد/المديونية.');
      onChanged?.();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'فشل إلغاء الفاتورة';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>إلغاء الفاتورة</DialogTitle>
          <DialogDescription>
            سيتم تغيير حالة الفاتورة إلى «ملغية» مع عكس القيود المحاسبية
            وإعادة رصيد المحفظة أو إسقاط المديونية. هذه العملية تُسجَّل
            في سجل التدقيق ويراها الأونر والمدير العام والمحاسب.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="void-reason">السبب (إلزامي)</Label>
            <Input
              id="void-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="اكتب سبب الإلغاء بوضوح"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            تراجع
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={saving}
          >
            {saving ? 'جارٍ الإلغاء…' : 'تأكيد الإلغاء'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
