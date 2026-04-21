import { useMemo, useState } from 'react';
import { Pencil, XCircle } from 'lucide-react';
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
import { can } from '@/modules/shared/auth/access-matrix';
import {
  ApiError,
  editInvoiceSameDay,
  voidInvoice,
  type EditInvoiceBody,
  type OrderRow,
} from '@/lib/api';

type Props = {
  order: OrderRow;
  onChanged?: () => void;
};

/**
 * V19.9 — Compact edit/void launcher shown on each invoice row for a
 * CALL_CENTER_SUPERVISOR. The Edit button is hidden for orders issued
 * on an earlier Kuwait-local day (same-day window only). Void is
 * available as long as the order is not already CANCELED.
 */
export function InvoiceSupervisorActions({ order, onChanged }: Props) {
  const { user } = useAuth();
  const canEdit = can(user, 'invoices.editSameDay');
  const canVoid = can(user, 'invoices.void');
  const [editOpen, setEditOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);

  const isSameDay = useMemo(() => {
    const d1 = new Date(order.createdAt);
    const d2 = new Date();
    const fmt = (d: Date) => {
      const kuwait = new Date(d.getTime() + 3 * 60 * 60 * 1000);
      return kuwait.toISOString().slice(0, 10);
    };
    return fmt(d1) === fmt(d2);
  }, [order.createdAt]);

  const alreadyCanceled = order.status === 'CANCELED';

  if (!canEdit && !canVoid) return null;
  if (alreadyCanceled) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30">
        هذه الفاتورة ملغية — لا يمكن التعديل عليها.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canEdit ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditOpen(true)}
          disabled={!isSameDay}
          title={
            !isSameDay
              ? 'التعديل مسموح في نفس اليوم فقط'
              : 'تعديل الفاتورة'
          }
          className="gap-1"
        >
          <Pencil className="h-3.5 w-3.5" />
          تعديل
        </Button>
      ) : null}
      {canVoid ? (
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setVoidOpen(true)}
          className="gap-1"
        >
          <XCircle className="h-3.5 w-3.5" />
          إلغاء الفاتورة
        </Button>
      ) : null}

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

function EditInvoiceDialog({
  open,
  onOpenChange,
  order,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: OrderRow;
  onChanged?: () => void;
}) {
  const { token } = useAuth();
  const [totalPrice, setTotalPrice] = useState(order.totalPrice);
  const [posPaymentMethod, setPosPaymentMethod] = useState<
    EditInvoiceBody['posPaymentMethod'] | ''
  >(order.posPaymentMethod ?? '');
  const [notes, setNotes] = useState(order.notes ?? '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!token) return;
    const body: EditInvoiceBody = {};
    if (totalPrice !== order.totalPrice) body.totalPrice = totalPrice;
    if (posPaymentMethod && posPaymentMethod !== order.posPaymentMethod)
      body.posPaymentMethod = posPaymentMethod || undefined;
    if (notes !== (order.notes ?? '')) body.notes = notes;
    if (reason.trim()) body.reason = reason.trim();
    if (Object.keys(body).length === 0) {
      toast.info('لم يتم إجراء أي تعديل.');
      return;
    }
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>تعديل الفاتورة</DialogTitle>
          <DialogDescription>
            التعديل مسموح فقط في نفس يوم إصدار الفاتورة. كل تعديل يتم
            تسجيله في سجل التدقيق مع المبلغ قبل وبعد التعديل.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="total">الإجمالي (د.ك)</Label>
            <Input
              id="total"
              inputMode="decimal"
              value={totalPrice}
              onChange={(e) => setTotalPrice(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pm">طريقة الدفع</Label>
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
              <option value="SUBSCRIPTION_WALLET">من محفظة الاشتراك</option>
            </select>
          </div>
          <div>
            <Label htmlFor="notes">ملاحظات</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="اختياري"
            />
          </div>
          <div>
            <Label htmlFor="reason">سبب التعديل (يظهر في سجل التدقيق)</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="اختياري ولكن مفضّل"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            إلغاء
          </Button>
          <Button onClick={submit} disabled={saving}>
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
  order: OrderRow;
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
