import { useTranslation } from 'react-i18next';
import { Calendar, ListOrdered, Receipt, Wallet } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
import { cn } from '@/lib/utils';
import type { Customer360Data } from '../../hooks/use-cc-customer-360';
import type { DispatchRow } from '../../api/cc-dashboard-api';

type Props = {
  data: Customer360Data;
  /** Most recent customer-scoped dispatch (from active list, may be null). */
  latestDispatch: DispatchRow | null;
};

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'default',
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'warning' | 'danger';
}) {
  return (
    <Card size="sm">
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="size-4" aria-hidden />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            'font-heading text-2xl font-semibold',
            tone === 'danger' && 'text-destructive',
            tone === 'warning' && 'text-amber-600 dark:text-amber-400',
          )}
        >
          {value}
        </div>
        {hint ? (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatDateTimeAr(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ar-KW', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function OverviewTab({ data, latestDispatch }: Props) {
  const { t } = useTranslation();
  const f = data.statement.financials;

  const totalDueKd = Number.parseFloat(f.totalDueKd);
  const hasDebt = Number.isFinite(totalDueKd) && totalDueKd > 0.0001;

  // Total invoices count is not exposed directly — the closest proxy
  // here is "active subscriptions" which already comes through 360.
  // We surface the most informative numbers without overstepping into
  // financial internals the CC role isn't supposed to manage.
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Receipt}
          label={t('callCenterDashboard.overview.totalInvoices', {
            defaultValue: 'إجمالي الفواتير',
          })}
          value={`${f.totalInvoicesKd} د.ك`}
        />
        <MetricCard
          icon={Wallet}
          label={t('callCenterDashboard.overview.outstanding', {
            defaultValue: 'المستحق على العميل',
          })}
          value={`${f.totalDueKd} د.ك`}
          tone={hasDebt ? 'warning' : 'default'}
          hint={t('callCenterDashboard.overview.readOnlyHint', {
            defaultValue: 'للقراءة فقط — لا يُحرر من هنا',
          })}
        />
        <MetricCard
          icon={ListOrdered}
          label={t('callCenterDashboard.overview.lastDispatch', {
            defaultValue: 'آخر مهمة نشطة',
          })}
          value={
            latestDispatch
              ? `${latestDispatch.driverName}`
              : t('callCenterDashboard.overview.noDispatchYet', {
                  defaultValue: 'لا توجد مهمة نشطة',
                })
          }
          hint={
            latestDispatch
              ? t('callCenterDashboard.overview.lastDispatchHint', {
                  minutes: latestDispatch.elapsedMinutes,
                  defaultValue: `منذ ${latestDispatch.elapsedMinutes} دقيقة`,
                })
              : undefined
          }
        />
        <MetricCard
          icon={Calendar}
          label={t('callCenterDashboard.overview.blockState', {
            defaultValue: 'حالة الحساب',
          })}
          value={
            f.isBlocked
              ? t('callCenterDashboard.overview.blocked', {
                  defaultValue: 'محظور',
                })
              : t('callCenterDashboard.overview.active', {
                  defaultValue: 'نشط',
                })
          }
          tone={f.isBlocked ? 'danger' : 'default'}
          hint={
            f.isBlocked && f.blockedAtIso
              ? `${t('callCenterDashboard.overview.blockedSince', {
                  defaultValue: 'محظور منذ',
                })} ${formatDateTimeAr(f.blockedAtIso)}`
              : undefined
          }
        />
      </div>

      {data.subscription &&
      Number.parseFloat(data.subscription.subscriptionValueKd) > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {t('callCenterDashboard.overview.subscriptionTitle', {
                defaultValue: 'الاشتراك الحالي',
              })}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">
                {t('callCenterDashboard.overview.subValue', {
                  defaultValue: 'قيمة الاشتراك',
                })}
              </p>
              <p className="font-medium">
                {data.subscription.subscriptionValueKd} د.ك
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {t('callCenterDashboard.overview.subConsumed', {
                  defaultValue: 'المستهلك',
                })}
              </p>
              <p className="font-medium">
                {data.subscription.subscriptionConsumedKd} د.ك
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {t('callCenterDashboard.overview.subRemaining', {
                  defaultValue: 'المتبقي',
                })}
              </p>
              <p className="font-medium">
                {data.subscription.subscriptionRemainingKd} د.ك
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
