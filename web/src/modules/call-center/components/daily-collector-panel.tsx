import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CircleDollarSign,
  Loader2,
  RefreshCw,
  User,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiError,
  apiJson,
  type DailyCollectionsResponse,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
import { cn } from '@/lib/utils';

type Props = {
  token: string | null;
};

const MAX_DEFAULT = 10;

/**
 * V19.4 — CC pack #4. "Daily collector" panel on the Collections page.
 * Lists today's debt-reducing events across every agent, with per-agent
 * totals so a supervisor can answer "who collected what today?" in one
 * glance, and shows each event's customer, amount, method, and
 * post-settlement debt remainder for traceability.
 */
export function DailyCollectorPanel({ token }: Props) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<DailyCollectionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiJson<DailyCollectionsResponse>(
        '/api/call-center/daily-collections',
        { token },
      );
      setData(res);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const locale = i18n.language.startsWith('ar') ? 'ar-KW' : 'en-KW';
  const fmtTime = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [locale],
  );

  const events = data?.events ?? [];
  const visibleEvents = showAll ? events : events.slice(0, MAX_DEFAULT);
  const hasData = (data?.totals.eventCount ?? 0) > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CircleDollarSign
            className="h-5 w-5 text-emerald-600"
            aria-hidden
          />
          <CardTitle className="text-base">
            {t('dailyCollector.title')}
          </CardTitle>
          {data ? (
            <span className="text-xs text-muted-foreground">
              {data.dayIsoLocal}
            </span>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <TotalTile
            label={t('dailyCollector.totalCollected')}
            value={formatKwdLabel(data?.totals.collectedKd ?? '0')}
            icon={<CircleDollarSign className="h-4 w-4" aria-hidden />}
            tone="success"
          />
          <TotalTile
            label={t('dailyCollector.totalDiscount')}
            value={formatKwdLabel(data?.totals.discountKd ?? '0')}
            icon={<CircleDollarSign className="h-4 w-4" aria-hidden />}
            tone="warning"
          />
          <TotalTile
            label={t('dailyCollector.uniqueCustomers')}
            value={String(data?.totals.uniqueCustomers ?? 0)}
            icon={<Users className="h-4 w-4" aria-hidden />}
            tone="info"
          />
        </div>

        {data && data.byAgent.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('dailyCollector.byAgent')}
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {data.byAgent.map((a) => (
                <li
                  key={a.agentId ?? '__unattributed__'}
                  className="flex items-center justify-between rounded-lg border bg-muted/30 p-2 text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <User
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="truncate font-medium">
                      {a.agentName ?? t('dailyCollector.unattributed')}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs">
                    <span className="tabular-nums text-muted-foreground">
                      {a.eventCount}×
                    </span>
                    <span className="tabular-nums font-semibold text-emerald-700 dark:text-emerald-300">
                      {formatKwdLabel(a.collectedKd)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('dailyCollector.activity')}
          </p>
          {!hasData ? (
            <p className="rounded-lg border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground">
              {t('dailyCollector.empty')}
            </p>
          ) : (
            <>
              <ul className="space-y-2">
                {visibleEvents.map((e) => {
                  const isDiscount =
                    Number.parseFloat(e.discountAppliedKd) > 0;
                  return (
                    <li
                      key={e.id}
                      className="rounded-lg border bg-card p-2.5 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium truncate">
                            {e.customerName ??
                              e.customerPhone ??
                              t('dailyCollector.unknownCustomer')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {fmtTime.format(new Date(e.atIso))}
                            {e.orderSerial ? ` · #${e.orderSerial}` : ''}
                            {e.performedByName
                              ? ` · ${e.performedByName}`
                              : ''}
                          </p>
                        </div>
                        <div className="shrink-0 text-end">
                          <p className="text-base font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                            {formatKwdLabel(e.amountCollectedKd)}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {t('dailyCollector.debtAfter')}:{' '}
                            <span className="tabular-nums">
                              {formatKwdLabel(e.customerDebtAfterKd)}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Chip tone="info">
                          {t(`dailyCollector.kind.${e.kind}`, {
                            defaultValue: e.kind,
                          })}
                        </Chip>
                        {e.paymentMethod ? (
                          <Chip tone="muted">
                            {t(
                              `dailyCollector.method.${e.paymentMethod}`,
                              { defaultValue: e.paymentMethod },
                            )}
                          </Chip>
                        ) : null}
                        {isDiscount ? (
                          <Chip tone="warning">
                            {t('dailyCollector.discount')}:{' '}
                            {formatKwdLabel(e.discountAppliedKd)}
                          </Chip>
                        ) : null}
                        {e.branchName ? (
                          <Chip tone="muted">🏬 {e.branchName}</Chip>
                        ) : null}
                        {e.driverName ? (
                          <Chip tone="muted">🚗 {e.driverName}</Chip>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {events.length > MAX_DEFAULT ? (
                <div className="mt-2 text-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAll((v) => !v)}
                  >
                    {showAll
                      ? t('dailyCollector.showLess')
                      : t('dailyCollector.showMore', {
                          count: events.length - MAX_DEFAULT,
                        })}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TotalTile({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: 'success' | 'warning' | 'info';
}) {
  const palette: Record<typeof tone, string> = {
    success:
      'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/30',
    warning:
      'border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/30',
    info: 'border-blue-200 bg-blue-50/60 dark:border-blue-900/60 dark:bg-blue-950/30',
  };
  return (
    <div className={cn('rounded-lg border p-3', palette[tone])}>
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Chip({
  tone,
  children,
}: {
  tone: 'info' | 'warning' | 'muted';
  children: React.ReactNode;
}) {
  const palette = {
    info: 'border-blue-200 bg-blue-50/60 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200',
    warning:
      'border-amber-200 bg-amber-50/60 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200',
    muted: 'border-muted bg-muted/30 text-muted-foreground',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        palette[tone],
      )}
    >
      {children}
    </span>
  );
}
