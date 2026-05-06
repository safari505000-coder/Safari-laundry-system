import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRightLeft,
  Loader2,
  RefreshCw,
  Send,
  ShieldOff,
  Truck,
} from 'lucide-react';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
import { useCcActiveDispatches } from '../../hooks/use-cc-active-dispatches';
import { CreateDispatchDialog } from '../create-dispatch-dialog';
import { ReassignDispatchDialog } from '../reassign-dispatch-dialog';
import { DispatchSeverityBadge } from '../dispatch-severity-badge';
import type { DispatchRow } from '../../api/cc-dashboard-api';

type Props = {
  customerId: string;
  customerName: string;
  isCustomerBlocked: boolean;
};

function formatTimeAr(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('ar-KW', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function DispatchTab({
  customerId,
  customerName,
  isCustomerBlocked,
}: Props) {
  const { t } = useTranslation();
  const [createOpen, setCreateOpen] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<DispatchRow | null>(
    null,
  );

  const { rows, snapshot, loading, refreshing, reload } =
    useCcActiveDispatches({
      customerId,
      pollMs: 10_000,
      paused: createOpen || reassignTarget !== null,
    });

  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        // Critical first, then late, then on-time; ties → oldest first.
        const sevWeight: Record<string, number> = {
          CRITICAL: 0,
          LATE: 1,
          ON_TIME: 2,
          COMPLETED: 3,
        };
        const sw = sevWeight[a.severity] - sevWeight[b.severity];
        if (sw !== 0) return sw;
        return (
          new Date(a.createdAtIso).getTime() -
          new Date(b.createdAtIso).getTime()
        );
      }),
    [rows],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Truck className="size-5" aria-hidden />
            {t('callCenterDashboard.dispatch.activeTitle', {
              defaultValue: 'المهمات النشطة لهذا العميل',
            })}
            {refreshing ? (
              <Loader2
                className="size-3.5 animate-spin text-muted-foreground"
                aria-hidden
              />
            ) : null}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={reload}
              disabled={loading}
              aria-label={t('common.refresh', { defaultValue: 'تحديث' })}
            >
              <RefreshCw className="size-3.5" aria-hidden />
              {t('common.refresh', { defaultValue: 'تحديث' })}
            </Button>
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              disabled={isCustomerBlocked}
              title={
                isCustomerBlocked
                  ? t('callCenterDashboard.dispatch.blockedTooltip', {
                      defaultValue:
                        'العميل محظور — لا يمكن إصدار مهمات جديدة',
                    })
                  : undefined
              }
            >
              <Send className="size-3.5" aria-hidden />
              {t('callCenterDashboard.dispatch.createCta', {
                defaultValue: 'إصدار مهمة',
              })}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isCustomerBlocked ? (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <ShieldOff className="mt-0.5 size-4" aria-hidden />
              <span>
                {t('callCenterDashboard.dispatch.blockedBanner', {
                  defaultValue:
                    'العميل محظور — أي مهمة جديدة سترفض من السيرفر برمز 403.',
                })}
              </span>
            </div>
          ) : null}

          {loading && sortedRows.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t('common.loading', { defaultValue: 'جاري التحميل…' })}
            </div>
          ) : sortedRows.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
              {t('callCenterDashboard.dispatch.empty', {
                defaultValue: 'لا توجد مهام حالياً',
              })}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {sortedRows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <DispatchSeverityBadge
                        severity={row.severity}
                        elapsedMinutes={row.elapsedMinutes}
                      />
                      <span className="text-sm font-medium">
                        {row.driverName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ·{' '}
                        {t('callCenterDashboard.dispatch.assignedAt', {
                          defaultValue: 'أُسندت في',
                        })}{' '}
                        {formatTimeAr(row.createdAtIso)}
                      </span>
                    </div>
                    {row.instructionNote ?
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {row.instructionNote}
                      </p>
                    : null}
                  </div>
                  <div className="shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReassignTarget(row)}
                      disabled={row.status !== 'ASSIGNED'}
                    >
                      <ArrowRightLeft className="size-3.5" aria-hidden />
                      {t('callCenterDashboard.dispatch.reassignCta', {
                        defaultValue: 'إعادة إسناد',
                      })}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {snapshot ? (
            <p className="mt-3 text-[11px] text-muted-foreground">
              {t('callCenterDashboard.dispatch.snapshotAt', {
                time: formatTimeAr(snapshot.generatedAtIso),
                defaultValue: `آخر تحديث من السيرفر: ${formatTimeAr(snapshot.generatedAtIso)}`,
              })}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <CreateDispatchDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        customerId={customerId}
        customerName={customerName}
        isCustomerBlocked={isCustomerBlocked}
        onCreated={reload}
      />

      {reassignTarget ? (
        <ReassignDispatchDialog
          open={reassignTarget !== null}
          onOpenChange={(open) => {
            if (!open) setReassignTarget(null);
          }}
          dispatch={reassignTarget}
          onReassigned={reload}
        />
      ) : null}
    </div>
  );
}
