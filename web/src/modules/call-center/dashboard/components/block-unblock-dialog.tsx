import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
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
import { useCcCustomerBlocking } from '../hooks/use-cc-customer-blocking';

type Mode = 'block' | 'unblock';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  customerId: string;
  customerName: string;
  /** Called after a successful mutation; UI should reload the 360. */
  onDone: () => void;
};

const MIN_BLOCK_REASON = 3;
const MAX_REASON = 240;

export function BlockUnblockDialog({
  open,
  onOpenChange,
  mode,
  customerId,
  customerName,
  onDone,
}: Props) {
  const { t } = useTranslation();
  const { block, unblock, submitting } = useCcCustomerBlocking();
  const [reason, setReason] = useState('');

  // Reset the form on close — done via the parent's onOpenChange so we
  // never run a setState inside a useEffect for a derived UI concern.
  const handleOpenChange = (next: boolean) => {
    if (!next) setReason('');
    onOpenChange(next);
  };

  const reasonTooShort =
    mode === 'block' && reason.trim().length < MIN_BLOCK_REASON;
  const reasonTooLong = reason.length > MAX_REASON;
  const submitDisabled = submitting || reasonTooShort || reasonTooLong;

  const handleSubmit = async () => {
    const trimmed = reason.trim();
    const result =
      mode === 'block'
        ? await block(customerId, trimmed)
        : await unblock(customerId, trimmed.length > 0 ? trimmed : undefined);

    if (result.ok) {
      toast.success(
        mode === 'block'
          ? t('callCenterDashboard.blocking.blockedToast', {
              defaultValue: 'تم حظر العميل',
            })
          : t('callCenterDashboard.blocking.unblockedToast', {
              defaultValue: 'تم إلغاء حظر العميل',
            }),
      );
      onDone();
      handleOpenChange(false);
    } else {
      toast.error(result.error);
    }
  };

  const Icon = mode === 'block' ? ShieldAlert : ShieldCheck;
  const titleKey =
    mode === 'block'
      ? 'callCenterDashboard.blocking.blockTitle'
      : 'callCenterDashboard.blocking.unblockTitle';
  const descKey =
    mode === 'block'
      ? 'callCenterDashboard.blocking.blockDesc'
      : 'callCenterDashboard.blocking.unblockDesc';
  const cta =
    mode === 'block'
      ? t('callCenterDashboard.blocking.confirmBlock', {
          defaultValue: 'تأكيد الحظر',
        })
      : t('callCenterDashboard.blocking.confirmUnblock', {
          defaultValue: 'إلغاء الحظر',
        });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon
              className={
                mode === 'block'
                  ? 'size-5 text-destructive'
                  : 'size-5 text-emerald-600'
              }
              aria-hidden
            />
            {t(titleKey, {
              defaultValue:
                mode === 'block' ? 'حظر العميل' : 'إلغاء حظر العميل',
            })}
          </DialogTitle>
          <DialogDescription>
            {t(descKey, {
              name: customerName,
              defaultValue:
                mode === 'block'
                  ? `سوف يُحظر «${customerName}» فوراً ولن يتمكن أي سائق من استلام مهمة جديدة لهذا العميل حتى يُلغى الحظر يدويًا.`
                  : `سوف يُرفع الحظر عن «${customerName}» وتعود الخدمة للعمل الطبيعي.`,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="block-reason">
            {mode === 'block'
              ? t('callCenterDashboard.blocking.reasonRequired', {
                  defaultValue: 'سبب الحظر (مطلوب)',
                })
              : t('callCenterDashboard.blocking.reasonOptional', {
                  defaultValue: 'سبب إلغاء الحظر (اختياري)',
                })}
          </Label>
          <Input
            id="block-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={MAX_REASON}
            placeholder={
              mode === 'block'
                ? t('callCenterDashboard.blocking.reasonBlockPh', {
                    defaultValue:
                      'مثال: العميل يرفض السداد رغم التذكير المتكرر',
                  })
                : t('callCenterDashboard.blocking.reasonUnblockPh', {
                    defaultValue: 'مثال: تم تسوية الدين كاملاً',
                  })
            }
            aria-invalid={reasonTooShort || reasonTooLong}
          />
          <p className="text-xs text-muted-foreground">
            {reason.length}/{MAX_REASON}
            {reasonTooShort ? (
              <span className="text-destructive">
                {' '}
                · {t('callCenterDashboard.blocking.reasonMinHint', {
                  defaultValue: 'الحد الأدنى 3 أحرف',
                })}
              </span>
            ) : null}
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            {t('common.cancel', { defaultValue: 'إلغاء' })}
          </Button>
          <Button
            variant={mode === 'block' ? 'destructive' : 'success'}
            disabled={submitDisabled}
            onClick={() => void handleSubmit()}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
