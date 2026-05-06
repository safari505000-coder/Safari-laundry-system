import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/shared/components/ui/dialog';
import { Label } from '@/modules/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/shared/components/ui/select';
import { Switch } from '@/modules/shared/components/ui/switch';
import { Textarea } from '@/modules/shared/components/ui/textarea';
import {
  updateCollectionStatus,
  type CustomerCollectionStatusKind,
  type OutstandingRow,
} from '../api/outstanding-api';

type Props = {
  open: boolean;
  row: OutstandingRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

const STATUS_OPTIONS: Array<{
  value: CustomerCollectionStatusKind;
  labelKey: string;
  fallback: string;
}> = [
  { value: 'NORMAL', labelKey: 'outstanding.status.normal', fallback: 'عادي' },
  { value: 'LATE', labelKey: 'outstanding.status.late', fallback: 'متأخر' },
  { value: 'RISK', labelKey: 'outstanding.status.risk', fallback: 'خطر' },
];

const MAX_NOTE = 500;

/**
 * V19.x — The single mutation surface for the AR module on the
 * frontend. Posts to PATCH /api/finance/customer/:id/status which:
 *   1. Upserts CustomerCollectionStatus.
 *   2. (Optionally) flips Customer.isBlocked.
 *   3. Logs CUSTOMER_COLLECTION_UPDATED + paired financial event.
 *
 * Nothing in this dialog auto-blocks; the operator must explicitly
 * flip the switch.
 */
export function EditCollectionStatusDialog({
  open,
  row,
  onOpenChange,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [status, setStatus] = useState<CustomerCollectionStatusKind>('NORMAL');
  const [blocked, setBlocked] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!row) return;
    setStatus(row.status);
    setBlocked(row.blocked);
    setNote(row.note ?? '');
  }, [row]);

  const handleClose = (next: boolean) => {
    if (submitting) return;
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!row || !token) return;
    if (note.length > MAX_NOTE) {
      toast.error(
        t('outstanding.editDialog.noteTooLong', {
          defaultValue: 'الملاحظة طويلة جداً (أقصى 500 حرف).',
        }),
      );
      return;
    }
    setSubmitting(true);
    try {
      await updateCollectionStatus(token, row.customerId, {
        status,
        blocked,
        note: note.trim() ? note.trim() : undefined,
      });
      toast.success(
        t('outstanding.editDialog.saved', {
          defaultValue: 'تم تحديث حالة العميل',
        }),
      );
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : t('outstanding.editDialog.failed', {
              defaultValue: 'تعذّر حفظ التحديث',
            }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!row) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-primary" aria-hidden />
            {t('outstanding.editDialog.title', {
              defaultValue: 'تعديل حالة العميل',
            })}
          </DialogTitle>
          <DialogDescription>
            {row.name ?? row.phone}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {t('outstanding.editDialog.statusLabel', {
                defaultValue: 'حالة التحصيل',
              })}
            </Label>
            <Select
              value={status}
              onValueChange={(v) =>
                v && setStatus(v as CustomerCollectionStatusKind)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {t(opt.labelKey, { defaultValue: opt.fallback })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex flex-col">
              <span className="font-medium text-sm">
                {t('outstanding.editDialog.blockToggle', {
                  defaultValue: 'حظر يدوي للعميل',
                })}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('outstanding.editDialog.blockHint', {
                  defaultValue:
                    'يمنع إنشاء فواتير جديدة. لا يُفعَّل تلقائياً.',
                })}
              </span>
            </div>
            <Switch checked={blocked} onCheckedChange={setBlocked} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ar-note" className="text-xs text-muted-foreground">
              {t('outstanding.editDialog.noteLabel', {
                defaultValue: 'ملاحظة داخلية (اختيارية)',
              })}
            </Label>
            <Textarea
              id="ar-note"
              value={note}
              maxLength={MAX_NOTE + 50}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={t('outstanding.editDialog.notePlaceholder', {
                defaultValue: 'مرئية لمركز الاتصال فقط…',
              })}
            />
            <span className="text-end text-[10px] text-muted-foreground">
              {note.length} / {MAX_NOTE}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => handleClose(false)}
            disabled={submitting}
          >
            {t('common.cancel', { defaultValue: 'إلغاء' })}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {t('outstanding.editDialog.save', { defaultValue: 'حفظ' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
