import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  Gauge,
  Info,
  ShieldAlert,
  Sparkles,
  TrendingDown,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
import { cn } from '@/lib/utils';
import { is360Internal, type Customer360Data } from '../../hooks/use-cc-customer-360';
import type { DispatchRow } from '../../api/cc-dashboard-api';

type Props = {
  data: Customer360Data;
  /** All currently-active dispatches scoped to this customer. */
  customerDispatches: DispatchRow[];
};

type RiskLevel = 'GREEN' | 'YELLOW' | 'RED';

type Flag = {
  id: string;
  label: string;
  description: string;
  level: RiskLevel;
};

function levelTone(level: RiskLevel) {
  switch (level) {
    case 'RED':
      return {
        bg: 'bg-red-50 dark:bg-red-950/30',
        border: 'border-red-300 dark:border-red-800',
        text: 'text-red-700 dark:text-red-300',
        icon: 'text-red-600 dark:text-red-400',
      };
    case 'YELLOW':
      return {
        bg: 'bg-amber-50 dark:bg-amber-950/30',
        border: 'border-amber-300 dark:border-amber-800',
        text: 'text-amber-800 dark:text-amber-300',
        icon: 'text-amber-600 dark:text-amber-400',
      };
    default:
      return {
        bg: 'bg-emerald-50 dark:bg-emerald-950/30',
        border: 'border-emerald-200 dark:border-emerald-800',
        text: 'text-emerald-700 dark:text-emerald-300',
        icon: 'text-emerald-600 dark:text-emerald-400',
      };
  }
}

function ratingToScoreLevel(
  rating: 'GOOD' | 'WATCH' | 'BLOCKED',
): RiskLevel {
  if (rating === 'BLOCKED') return 'RED';
  if (rating === 'WATCH') return 'YELLOW';
  return 'GREEN';
}

export function RiskTab({ data, customerDispatches }: Props) {
  const { t } = useTranslation();
  const f = data.statement.financials;
  const internal = is360Internal(data);

  const flags = useMemo<Flag[]>(() => {
    const result: Flag[] = [];

    // 1) Outstanding balance (cash exposure proxy)
    const due = Number.parseFloat(f.totalDueKd);
    if (Number.isFinite(due)) {
      if (due >= 50) {
        result.push({
          id: 'highCashExposure',
          label: t('callCenterDashboard.risk.flag.highCash.label', {
            defaultValue: 'تعرّض نقدي مرتفع',
          }),
          description: t('callCenterDashboard.risk.flag.highCash.desc', {
            value: f.totalDueKd,
            defaultValue: `مستحق على العميل ${f.totalDueKd} د.ك — تحقّق قبل أي مهمة جديدة.`,
          }),
          level: due >= 100 ? 'RED' : 'YELLOW',
        });
      }
    }

    // 2) Frequent reassignments — derived from successor chain
    const reassignedCount = customerDispatches.filter(
      (d) =>
        d.instructionNote != null &&
        /إعادة|reassign/i.test(d.instructionNote),
    ).length;
    if (reassignedCount >= 2) {
      result.push({
        id: 'frequentReassign',
        label: t('callCenterDashboard.risk.flag.reassign.label', {
          defaultValue: 'إعادات إسناد متكررة',
        }),
        description: t('callCenterDashboard.risk.flag.reassign.desc', {
          count: reassignedCount,
          defaultValue: `هذا العميل تم تحويل مهماته ${reassignedCount} مرات اليوم — مؤشر على عدم استقرار التنفيذ.`,
        }),
        level: reassignedCount >= 4 ? 'RED' : 'YELLOW',
      });
    }

    // 3) Late dispatch pattern — any LATE/CRITICAL row right now
    const lateCount = customerDispatches.filter(
      (d) => d.severity === 'LATE' || d.severity === 'CRITICAL',
    ).length;
    if (lateCount > 0) {
      const hasCritical = customerDispatches.some(
        (d) => d.severity === 'CRITICAL',
      );
      result.push({
        id: 'latePattern',
        label: t('callCenterDashboard.risk.flag.late.label', {
          defaultValue: 'نمط تأخّر بالمهمات',
        }),
        description: t('callCenterDashboard.risk.flag.late.desc', {
          count: lateCount,
          defaultValue: `هناك ${lateCount} مهمة متأخّرة الآن لهذا العميل.`,
        }),
        level: hasCritical ? 'RED' : 'YELLOW',
      });
    }

    // 4) Currently blocked → terminal red flag
    if (f.isBlocked) {
      result.push({
        id: 'blocked',
        label: t('callCenterDashboard.risk.flag.blocked.label', {
          defaultValue: 'حساب محظور',
        }),
        description:
          f.blockReason ||
          t('callCenterDashboard.risk.flag.blocked.desc', {
            defaultValue:
              'العميل محظور حالياً ولا يستطيع استلام مهمات جديدة.',
          }),
        level: 'RED',
      });
    }

    return result;
  }, [
    f.totalDueKd,
    f.isBlocked,
    f.blockReason,
    customerDispatches,
    t,
  ]);

  const overallLevel: RiskLevel = useMemo(() => {
    if (flags.some((flag) => flag.level === 'RED')) return 'RED';
    if (flags.some((flag) => flag.level === 'YELLOW')) return 'YELLOW';
    return 'GREEN';
  }, [flags]);

  const ratingLevel = ratingToScoreLevel(data.rating);

  return (
    <div className="space-y-4">
      {/*
       * Informational notice — this tab is READ-ONLY for the call
       * center role. No button on this tab triggers any financial,
       * dispatch, or block side-effect; flags are derived from the
       * Customer 360 payload + the polled active-dispatch snapshot.
       * See `RiskTab.test` (frontend) for the contract: zero
       * mutations are issued from this component.
       */}
      <div
        role="note"
        className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200"
      >
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          {t('callCenterDashboard.risk.informationalNotice', {
            defaultValue:
              'هذه إشارات معلوماتية فقط — لا تُنفّذ أي إجراء مالي تلقائي. القرار بيد المشرف.',
          })}
        </span>
      </div>

      {overallLevel === 'RED' ? (
        <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">
              {t('callCenterDashboard.risk.banner.title', {
                defaultValue: 'هذا العميل يُظهر سلوكاً تشغيلياً غير اعتيادي',
              })}
            </p>
            <p className="text-sm opacity-80">
              {t('callCenterDashboard.risk.banner.desc', {
                defaultValue:
                  'راجع الإشارات أدناه قبل إصدار أي مهمة جديدة، وأبلغ المشرف إذا تكرّر النمط.',
              })}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Score / Rating card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="size-4" aria-hidden />
              {t('callCenterDashboard.risk.scoreTitle', {
                defaultValue: 'مؤشّر المخاطرة',
              })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                'rounded-lg border px-3 py-2 text-sm',
                levelTone(ratingLevel).bg,
                levelTone(ratingLevel).border,
                levelTone(ratingLevel).text,
              )}
            >
              <div className="font-medium">
                {t(`callCenterDashboard.risk.rating.${data.rating}`, {
                  defaultValue: data.rating,
                })}
              </div>
              {internal && data.score ? (
                <div className="mt-1 flex items-baseline gap-1 text-xs opacity-80">
                  <span className="text-base font-semibold">
                    {data.score.value}
                  </span>
                  <span>/ 100</span>
                  {data.score.feedbackAverage != null ? (
                    <span className="ms-2">
                      ·{' '}
                      {t('callCenterDashboard.risk.feedbackAvg', {
                        value: data.score.feedbackAverage.toFixed(1),
                        defaultValue: `تقييم العميل ${data.score.feedbackAverage.toFixed(1)}`,
                      })}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            {internal && data.score && data.score.factors.length > 0 ? (
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                {data.score.factors.slice(0, 4).map((factor) => (
                  <li
                    key={factor}
                    className="flex items-start gap-1.5 leading-relaxed"
                  >
                    <TrendingDown
                      className="mt-0.5 size-3 shrink-0"
                      aria-hidden
                    />
                    <span>{factor}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>

        {/* Insights card (internal payload only) */}
        {internal && data.insights ? (
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4" aria-hidden />
                {t('callCenterDashboard.risk.insightsTitle', {
                  defaultValue: 'تحليل تشغيلي',
                })}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium">{data.insights.summary}</p>
              <p className="leading-relaxed text-muted-foreground">
                {data.insights.detail}
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Flags list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="size-4" aria-hidden />
            {t('callCenterDashboard.risk.flagsTitle', {
              defaultValue: 'إشارات تحذيرية',
            })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {flags.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              <CheckCircle2 className="size-4" aria-hidden />
              {t('callCenterDashboard.risk.noFlags', {
                defaultValue: 'لا توجد إشارات حالياً — حساب طبيعي.',
              })}
            </div>
          ) : (
            <ul className="space-y-2">
              {flags.map((flag) => {
                const tone = levelTone(flag.level);
                return (
                  <li
                    key={flag.id}
                    className={cn(
                      'flex items-start gap-3 rounded-md border px-3 py-2 text-sm',
                      tone.bg,
                      tone.border,
                      tone.text,
                    )}
                  >
                    <AlertTriangle
                      className={cn('mt-0.5 size-4 shrink-0', tone.icon)}
                      aria-hidden
                    />
                    <div>
                      <p className="font-medium">{flag.label}</p>
                      <p className="text-xs opacity-80">{flag.description}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Backend-supplied alerts (CC payload only) */}
      {internal && data.alerts && data.alerts.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {t('callCenterDashboard.risk.systemAlertsTitle', {
                defaultValue: 'تنبيهات النظام',
              })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {data.alerts.map((alert, idx) => (
                <li
                  key={`${alert.code}-${idx}`}
                  className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
                >
                  <span className="font-mono text-[11px] opacity-70">
                    {alert.code}
                  </span>
                  <span className="ms-2">{alert.message}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
