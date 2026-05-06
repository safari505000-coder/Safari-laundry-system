import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRightLeft, Loader2, RefreshCw } from 'lucide-react';
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
import type { DispatchRow } from '../api/cc-dashboard-api';

const MAX_REASON = 500;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dispatch: DispatchRow;
  onReassigned: () => void;
};

export function ReassignDispatchDialog({
  open,
  onOpenChange,
  dispatch,
  onReassigned,
}: Props) {
  const { t } = useTranslation();
  const { reassign, submitting } = useCcDispatchActions();
  const {
    drivers,
    loading: driversLoading,
    refreshing: driversRefreshing,
    error: driversError,
    reload: reloadDrivers,
  } = useCcDrivers({ paused: !open });

  const [newDriverId, setNewDriverId] = useState('');
  const [reason, setReason] = useState('');

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setNewDriverId('');
      setReason('');
    }
    onOpenChange(next);
  };

  // Exclude the current driver from the picker — backend rejects an
  // unchanged assignment (DRIVER_UNCHANGED). We do the same client-
  // side so the operator never wastes a click. Server already sorts
  // by least-loaded; we preserve that order.
  const eligibleDrivers = useMemo(
    () => drivers.filter((d) => d.id && d.id !== dispatch.driverId),
    [drivers, dispatch.driverId],
  );
  const noEligibleDrivers = !driversLoading && eligibleDrivers.length === 0;

  const reasonTooLong = reason.length > MAX_REASON;
  const submitDisabled =
    submitting ||
    driversLoading ||
    noEligibleDrivers ||
    newDriverId.trim().length === 0 ||
    newDriverId === dispatch.driverId ||
    reasonTooLong;

  const handleSubmit = async () => {
    const trimmed = reason.trim();
    const result = await reassign(dispatch.id, {
      newDriverId,
      reason: trimmed.length > 0 ? trimmed : undefined,
    });
    if (result.ok) {
      toast.success(
        t('callCenterDashboard.reassign.successToast', {
          defaultValue: 'تم تحويل المهمة للسائق الجديد',
        }),
      );
      onReassigned();
      handleOpenChange(false);
    } else {
      toast.error(result.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="size-5 text-primary" aria-hidden />
            {t('callCenterDashboard.reassign.title', {
              defaultValue: 'إعادة إسناد المهمة',
            })}
          </DialogTitle>
          <DialogDescription>
            {t('callCenterDashboard.reassign.desc', {
              from: dispatch.driverName,
              defaultValue: `تحويل المهمة الحالية من «${dispatch.driverName}» إلى سائق آخر. تُنشأ مهمة خلف (successor) وتبقى المهمة الأصلية مسندة حتى يصل الطلب الذي يقفلها.`,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="reassign-driver">
              {t('callCenterDashboard.reassign.newDriverLabel', {
                defaultValue: 'السائق الجديد',
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
          ) : noEligibleDrivers ? (
            <div
              data-testid="cc-reassign-dispatch-no-drivers"
              className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground"
            >
              {t('callCenterDashboard.reassign.noOtherDrivers', {
                defaultValue: 'لا يوجد سائقين نشطين حالياً',
              })}
            </div>
          ) : (
            <Select
              value={newDriverId}
              onValueChange={(v) =>
                setNewDriverId(typeof v === 'string' ? v : '')
              }
              disabled={driversLoading}
            >
              <SelectTrigger id="reassign-driver" className="w-full h-10">
                <SelectValue
                  placeholder={
                    driversLoading
                      ? t('common.loading', { defaultValue: 'جارِ التحميل…' })
                      : t(
                          'callCenterDashboard.reassign.newDriverPlaceholder',
                          { defaultValue: 'اختر السائق' },
                        )
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {eligibleDrivers.map((d) => (
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
          <Label htmlFor="reassign-reason">
            {t('callCenterDashboard.reassign.reasonLabel', {
              defaultValue: 'سبب التحويل (اختياري)',
            })}
          </Label>
          <Textarea
            id="reassign-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={MAX_REASON}
            placeholder={t(
              'callCenterDashboard.reassign.reasonPlaceholder',
              {
                defaultValue:
                  'مثال: السائق الأول لم يصل خلال 25 دقيقة.',
              },
            )}
            aria-invalid={reasonTooLong}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            {reason.length}/{MAX_REASON}
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
            data-testid="cc-reassign-dispatch-submit"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {t('callCenterDashboard.reassign.confirm', {
              defaultValue: 'تأكيد التحويل',
            })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
