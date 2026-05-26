import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw, Send, ShieldOff } from 'lucide-react';
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
import { Label } from '@/modules/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/shared/components/ui/select';
import { Textarea } from '@/modules/shared/components/ui/textarea';
import { useCcDispatchActions } from '../hooks/use-cc-dispatch-actions';
import { useCcDrivers } from '../hooks/use-cc-drivers';

const MAX_NOTE = 500;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  isCustomerBlocked: boolean;
  /** Pre-filled driver note when opened from website order intake, etc. */
  defaultInstructionNote?: string;
  /** Called after a successful create — UI should reload the dispatch list. */
  onCreated: () => void;
};

export function CreateDispatchDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  isCustomerBlocked,
  defaultInstructionNote,
  onCreated,
}: Props) {
  const { t } = useTranslation();
  const { create, submitting } = useCcDispatchActions();
  // Driver roster — `paused: !open` keeps the network quiet while the
  // dialog is closed AND prevents stale lists from rendering when the
  // user reopens after a long gap (focus refetch handles that path).
  const {
    drivers,
    loading: driversLoading,
    refreshing: driversRefreshing,
    error: driversError,
    reload: reloadDrivers,
  } = useCcDrivers({ paused: !open });

  const [driverId, setDriverId] = useState<string>('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setNote((defaultInstructionNote ?? '').slice(0, MAX_NOTE));
    }
  }, [open, defaultInstructionNote]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setDriverId('');
      setNote('');
    }
    onOpenChange(next);
  };

  // Backend already sorts (least-loaded first, then alphabetical) and
  // already filters to active+role=DRIVER. We do not re-sort or re-
  // filter here — the server is the source of truth for the picker
  // ordering so every operator sees the same list.
  const driverOptions = useMemo(
    () => drivers.filter((d) => d.id.length > 0),
    [drivers],
  );
  const driverOptionsEmpty = !driversLoading && driverOptions.length === 0;

  const noteTooLong = note.length > MAX_NOTE;
  const submitDisabled =
    submitting ||
    isCustomerBlocked ||
    driversLoading ||
    driverOptionsEmpty ||
    driverId.trim().length === 0 ||
    noteTooLong;

  const handleSubmit = async () => {
    if (isCustomerBlocked) {
      toast.error(
        t('callCenterDashboard.createDispatch.blockedToast', {
          defaultValue: 'العميل محظور، لا يمكن إنشاء مهمة',
        }),
      );
      return;
    }
    const trimmedNote = note.trim();
    const result = await create({
      customerId,
      driverId,
      instructionNote: trimmedNote.length > 0 ? trimmedNote : undefined,
    });
    if (result.ok) {
      toast.success(
        t('callCenterDashboard.createDispatch.successToast', {
          defaultValue: 'تم إنشاء المهمة وإشعار السائق',
        }),
      );
      onCreated();
      handleOpenChange(false);
      return;
    }
    // 403 CUSTOMER_BLOCKED → friendlier copy
    const isBlocked =
      result.errorCode === 'CUSTOMER_BLOCKED' || result.status === 403;
    toast.error(
      isBlocked
        ? t('callCenterDashboard.createDispatch.blockedToast', {
            defaultValue: 'العميل محظور، لا يمكن إنشاء مهمة',
          })
        : result.error,
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="size-5 text-primary" aria-hidden />
            {t('callCenterDashboard.createDispatch.title', {
              defaultValue: 'إنشاء مهمة جديدة',
            })}
          </DialogTitle>
          <DialogDescription>
            {t('callCenterDashboard.createDispatch.desc', {
              name: customerName,
              defaultValue: `إصدار تعليمات استلام/توصيل لـ «${customerName}». السائق يستلم الإشعار فوراً ولا يستطيع رفض المهمة.`,
            })}
          </DialogDescription>
        </DialogHeader>

        {isCustomerBlocked ? (
          <div
            role="alert"
            data-testid="cc-create-dispatch-blocked-banner"
            className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <ShieldOff className="mt-0.5 size-4" aria-hidden />
            <span>
              {t('callCenterDashboard.createDispatch.blockedBanner', {
                defaultValue:
                  'العميل محظور — يجب إلغاء الحظر قبل إصدار أي مهمة جديدة.',
              })}
            </span>
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="dispatch-driver">
              {t('callCenterDashboard.createDispatch.driverLabel', {
                defaultValue: 'السائق',
              })}
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={reloadDrivers}
              disabled={driversLoading || driversRefreshing}
              aria-label={t('common.refresh', { defaultValue: 'تحديث' })}
            >
              <RefreshCw
                className={`size-3.5 ${
                  driversLoading || driversRefreshing ? 'animate-spin' : ''
                }`}
                aria-hidden
              />
            </Button>
          </div>

          {driversError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              {driversError}
            </div>
          ) : driverOptionsEmpty ? (
            <div
              data-testid="cc-create-dispatch-no-drivers"
              className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground"
            >
              {t('callCenterDashboard.createDispatch.noDriversYet', {
                defaultValue: 'لا يوجد سائقين نشطين حالياً',
              })}
            </div>
          ) : (
            <Select
              value={driverId}
              onValueChange={(v) => setDriverId(typeof v === 'string' ? v : '')}
              disabled={driversLoading}
            >
              <SelectTrigger id="dispatch-driver" className="w-full h-10">
                <SelectValue
                  placeholder={
                    driversLoading
                      ? t('common.loading', { defaultValue: 'جارِ التحميل…' })
                      : t(
                          'callCenterDashboard.createDispatch.driverPlaceholder',
                          { defaultValue: 'اختر السائق' },
                        )
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {driverOptions.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                    {d.activeLoad > 0 ? (
                      <span className="ms-2 text-xs text-muted-foreground">
                        ·{' '}
                        {t('callCenterDashboard.createDispatch.activeLoad', {
                          count: d.activeLoad,
                          defaultValue: '{{count}} مهمة نشطة',
                        })}
                      </span>
                    ) : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="dispatch-note">
            {t('callCenterDashboard.createDispatch.noteLabel', {
              defaultValue: 'ملاحظة للسائق (اختياري)',
            })}
          </Label>
          <Textarea
            id="dispatch-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={MAX_NOTE}
            placeholder={t(
              'callCenterDashboard.createDispatch.notePlaceholder',
              {
                defaultValue:
                  'مثال: العميل ينتظر بالباب — اتصل قبل الوصول.',
              },
            )}
            aria-invalid={noteTooLong}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            {note.length}/{MAX_NOTE}
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
            variant="default"
            disabled={submitDisabled}
            onClick={() => void handleSubmit()}
            data-testid="cc-create-dispatch-submit"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
            {t('callCenterDashboard.createDispatch.confirm', {
              defaultValue: 'إصدار المهمة',
            })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
