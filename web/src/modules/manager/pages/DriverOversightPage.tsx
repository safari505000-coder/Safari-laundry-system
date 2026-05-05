import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  HandCoins,
  Map as MapIcon,
  Phone,
  Receipt,
  RefreshCw,
  ShieldAlert,
  Timer,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { notify } from '@/lib/notify';
import { can } from '@/modules/shared/auth/access-matrix';
import {
  getCashIntelligenceDashboard,
  getDriverOversight,
  type CashIntelDashboardResponse,
  type DriverOversightCard,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { Badge } from '@/modules/shared/components/ui/badge';
import {
  Button,
  buttonVariants,
} from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
} from '@/modules/shared/components/ui/card';
import { Skeleton } from '@/modules/shared/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * V19.22.5 — Branch Manager "مراقبة السائقين" (Driver Oversight).
 *
 * One colourful card per active DRIVER in the manager's branch.
 * Each card bundles today's invoice count, pending invoices, the
 * SSoT-sourced cash residue (from the cash-intelligence dashboard),
 * and stale quick-capture risks. Cards tint to amber when the
 * driver is off shift and to red when the driver is at risk (any
 * stale quick row or > 10 pending invoices).
 *
 * SSoT lock (post-mortem on the 111.450 KD vs 0.5000 KD mismatch):
 *
 *   The legacy `heldCashKd` / `cashTodayKd` fields on
 *   /api/manager/driver-oversight were a competing ledger
 *   (PAID_TO_DRIVER all-time accumulator + today's gross revenue).
 *   They are now nullified at the backend. This page reads driver
 *   cash EXCLUSIVELY from
 *     GET /api/cash-intelligence/dashboard → drivers[].totalCash
 *   joined by `driverId`. Frontend computes nothing — all monetary
 *   values are pre-formatted (4dp KD strings) by the backend.
 *
 * Data is re-fetched every 60 s and on demand via the refresh
 * button — no SSE, same polling rhythm as the Accountant watchdog.
 */

const POLL_MS = 60_000;

export function DriverOversightPage() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const [rows, setRows] = useState<DriverOversightCard[] | null>(null);
  const [dashboard, setDashboard] = useState<CashIntelDashboardResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      // Fetch the operational counters AND the cash-intelligence
      // SSoT in parallel. Driver cash is read ONLY from the SSoT.
      const [oversight, ssot] = await Promise.all([
        getDriverOversight(token),
        getCashIntelligenceDashboard(token),
      ]);
      setRows(oversight);
      setDashboard(ssot);
    } catch (e) {
      notify.error(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const canOpenMap = can(user, 'driverMonitor.view');

  // SSoT: per-driver cash keyed by driverId. The backend already
  // pre-formats every value as a 4dp KD string — we never recompute.
  const cashByDriverId = useMemo(() => {
    const m = new Map<string, string>();
    if (dashboard) {
      for (const d of dashboard.drivers) m.set(d.driverId, d.totalCash);
    }
    return m;
  }, [dashboard]);

  // Operational totals only — NEVER aggregate cash here. The
  // group-wide cash total is `dashboard.totalCash` (pre-summed by
  // the backend SSoT layer).
  const totals = useMemo(() => {
    if (!rows) return null;
    let ordersToday = 0;
    let atRisk = 0;
    for (const r of rows) {
      ordersToday += r.ordersTodayCount;
      if (r.atRisk) atRisk += 1;
    }
    return { ordersToday, atRisk };
  }, [rows]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            {t('driverOversight.title')}
          </h1>
          <p className="text-sm text-zinc-500">
            {t('driverOversight.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canOpenMap ? (
            <Link
              to="/admin/driver-monitoring"
              className={cn(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'gap-2',
              )}
            >
              <MapIcon className="h-4 w-4" aria-hidden />
              {t('driverOversight.map.link')}
            </Link>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw
              className={cn('h-4 w-4', loading ? 'animate-spin' : '')}
              aria-hidden
            />
            {t('common.refresh', { defaultValue: 'تحديث' })}
          </Button>
        </div>
      </header>

      {totals ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <TotalsTile
            icon={UserIcon}
            label={t('driverOversight.totals.drivers', {
              count: rows?.length ?? 0,
            })}
            tone="from-sky-50 to-sky-100 border-sky-200 text-sky-900"
          />
          <TotalsTile
            icon={Receipt}
            label={t('driverOversight.totals.ordersToday', {
              count: totals.ordersToday,
            })}
            tone="from-emerald-50 to-emerald-100 border-emerald-200 text-emerald-900"
          />
          {/*
            SSoT: total live cash across this manager's branch comes
            from the cash-intelligence dashboard (pre-summed, 4dp).
            We never reduce per-driver values here.
          */}
          <TotalsTile
            icon={HandCoins}
            label={t('driverOversight.totals.cashLive', {
              total: formatKwdLabel(dashboard?.totalCash ?? '0.0000'),
              defaultValue: 'Live cash on drivers: {{total}}',
            })}
            tone="from-amber-50 to-amber-100 border-amber-200 text-amber-900"
          />
        </div>
      ) : null}

      {loading && !rows ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : (rows?.length ?? 0) === 0 ? (
        <Card className="rounded-[20px] border-border bg-card shadow-sm">
          <CardContent className="px-6 py-16 text-center text-sm text-zinc-500">
            {t('driverOversight.empty')}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows?.map((r) => (
            <OversightCard
              key={r.driverId}
              row={r}
              ssotCashKd={cashByDriverId.get(r.driverId) ?? '0.0000'}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OversightCard({
  row,
  ssotCashKd,
}: {
  row: DriverOversightCard;
  /**
   * SSoT-sourced live cash residue (KD, 4dp string) for this driver.
   * Comes from /api/cash-intelligence/dashboard → drivers[].totalCash.
   * Pre-formatted by the backend; the page never recomputes it.
   */
  ssotCashKd: string;
}) {
  const { t } = useTranslation();
  const onShift = row.shiftStatus === 'ON_SHIFT';

  const toneClass = row.atRisk
    ? 'bg-rose-50 border-rose-300'
    : onShift
      ? 'bg-white border-emerald-200'
      : 'bg-zinc-50 border-zinc-200';

  const accent = row.atRisk
    ? 'text-rose-900'
    : onShift
      ? 'text-emerald-900'
      : 'text-zinc-700';

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border p-4 shadow-sm transition-colors',
        toneClass,
      )}
    >
      <div
        className={cn(
          'absolute inset-x-0 top-0 h-1',
          row.atRisk
            ? 'bg-rose-500'
            : onShift
              ? 'bg-emerald-500'
              : 'bg-zinc-400',
        )}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-full',
              row.atRisk
                ? 'bg-rose-100 text-rose-700'
                : onShift
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-zinc-200 text-zinc-700',
            )}
          >
            <UserIcon className="h-6 w-6" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-zinc-900">{row.fullName}</div>
            <div className="text-xs text-zinc-500">@{row.username}</div>
            {row.phone ? (
              <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                <Phone className="h-3 w-3" aria-hidden />
                <span className="tabular-nums">{row.phone}</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge
            variant="outline"
            className={cn(
              'gap-1 border',
              onShift
                ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                : 'border-zinc-300 bg-zinc-100 text-zinc-700',
            )}
          >
            {onShift ? (
              <CheckCircle2 className="h-3 w-3" aria-hidden />
            ) : (
              <Timer className="h-3 w-3" aria-hidden />
            )}
            {t(`driverOversight.shiftStatus.${row.shiftStatus}`)}
          </Badge>
          {row.atRisk ? (
            <Badge
              variant="outline"
              className="gap-1 border-rose-300 bg-rose-100 text-rose-900"
            >
              <AlertTriangle className="h-3 w-3" aria-hidden />
              {t('driverOversight.card.atRisk')}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-900"
            >
              {t('driverOversight.card.healthy')}
            </Badge>
          )}
        </div>
      </div>

      <div className={cn('mt-4 grid grid-cols-2 gap-2', accent)}>
        <MetricTile
          icon={Receipt}
          label={t('driverOversight.card.ordersToday')}
          value={String(row.ordersTodayCount)}
        />
        <MetricTile
          icon={AlertTriangle}
          label={t('driverOversight.card.pending')}
          value={String(row.pendingInvoicesCount)}
          tone={row.pendingInvoicesCount > 0 ? 'warn' : undefined}
        />
        {/*
          SSoT cash tile. Reads directly from
          /api/cash-intelligence/dashboard → drivers[].totalCash.
          NEVER from row.cashTodayKd or row.heldCashKd (both nullified
          at the backend). The string is already 4dp KD.
        */}
        <MetricTile
          icon={HandCoins}
          label={t('driverOversight.card.cashLive', {
            defaultValue: 'Live cash',
          })}
          value={formatKwdLabel(ssotCashKd)}
          span={2}
        />
        {row.staleQuickCount > 0 ? (
          <MetricTile
            icon={ShieldAlert}
            label={t('driverOversight.card.staleRisks')}
            value={`${row.staleQuickCount} · ${formatKwdLabel(row.staleQuickKd)}`}
            tone="danger"
            span={2}
          />
        ) : null}
      </div>
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  tone,
  span = 1,
}: {
  icon: typeof Receipt;
  label: string;
  value: string;
  tone?: 'warn' | 'danger';
  span?: 1 | 2;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border bg-white/70 px-2.5 py-2 text-xs backdrop-blur-sm',
        tone === 'danger'
          ? 'border-rose-200 bg-rose-50 text-rose-900'
          : tone === 'warn'
            ? 'border-amber-200 bg-amber-50 text-amber-900'
            : 'border-zinc-200 text-zinc-700',
        span === 2 ? 'col-span-2' : '',
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        <div className="text-[10px] font-medium uppercase tracking-wide opacity-70">
          {label}
        </div>
        <div className="font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function TotalsTile({
  icon: Icon,
  label,
  tone,
}: {
  icon: typeof Receipt;
  label: string;
  tone: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border bg-gradient-to-br px-4 py-3 shadow-sm',
        tone,
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/70">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="text-sm font-semibold">{label}</div>
    </div>
  );
}

export default DriverOversightPage;
