import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  Car,
  Clock,
  Gauge,
  Landmark,
  Link2,
  Receipt,
  Signal,
  Smartphone,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  type BranchOperationsLiveResponse,
  type BranchRow,
  type DailyPosSalesByPaymentMethodReport,
  type DriverMonitoringResponse,
  type ExecutiveSummaryReport,
  type IssuedInvoicesReport,
  type LiveFeedResponse,
  type OpenDebtByIssuerReport,
  apiJson,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { cn } from '@/lib/utils';

type MoneyPulse = {
  cashKd: number;
  knetKd: number;
  linkKd: number;
  onlineKd: number;
  subWalletKd: number;
  debtKd: number;
};

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function startOfDayIso(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

function endOfDayIso(d: Date): string {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
}

/** Non-operational / meta rows — hidden from the Pulse “branch load” strip only. */
const PULSE_EXCLUDED_BRANCH_NAMES = new Set(['المكتب', 'المكتب يوزرات فقط', 'خارجي']);

function isPulseVisibleBranchName(name: string | undefined | null): boolean {
  const n = name?.trim() ?? '';
  if (!n || n === '—') return true;
  return !PULSE_EXCLUDED_BRANCH_NAMES.has(n);
}

// @V24-LEGACY-MATH: summed rows locally. Now uses issuedReport.totals.totalKd from server.
// function sumIssuedKd(inv: IssuedInvoicesReport | null): number {
//   if (!inv?.rows?.length) return 0;
//   return inv.rows.reduce((acc, r) => acc + toNum(r.totalPrice), 0);
// }
function sumIssuedKd(inv: IssuedInvoicesReport | null): number {
  // V25 — read server-computed total; fall back to 0 when report is absent.
  return toNum(inv?.totals?.totalKd);
}

type PosDayMetrics = {
  posTotalKd: number;
  collectedKd: number;
  onAccountKd: number;
  subscriptionWalletKd: number;
  paymentLinkKd: number;
  paymentLinkOrders: number;
  onlineKd: number;
  onlineOrders: number;
  subscriptionWalletOrders: number;
  collectionRatePct: number;
};

// @V24-LEGACY-MATH: aggregated totals locally across rows.
// V25: posTotalKd, collectedKd, onAccountKd, collectionRatePct now read from
// pos.totals (server-computed). Per-method details still pivoted from rows.
function computePosDayMetrics(
  pos: DailyPosSalesByPaymentMethodReport | null,
): PosDayMetrics {
  const rows = pos?.rows ?? [];
  // V25 — read server aggregates directly.
  const posTotalKd = toNum(pos?.totals?.totalKd);
  const collectedKd = toNum(pos?.totals?.collectedKd);
  const onAccountKd = toNum(pos?.totals?.onAccountKd);
  const collectionRatePct = (pos?.totals?.collectionRateBps ?? 0) / 100;

  // Per-method detail pivot (not math; just reorganising server rows by key).
  let subscriptionWalletKd = 0;
  let paymentLinkKd = 0;
  let paymentLinkOrders = 0;
  let onlineKd = 0;
  let onlineOrders = 0;
  let subscriptionWalletOrders = 0;

  for (const r of rows) {
    const v = toNum(r.totalRevenue);
    const oc = r.orderCount ?? 0;
    switch (r.posPaymentMethod) {
      case 'SUBSCRIPTION_WALLET':
        subscriptionWalletKd += v;
        subscriptionWalletOrders += oc;
        break;
      case 'PAYMENT_LINK':
        paymentLinkKd += v;
        paymentLinkOrders += oc;
        break;
      case 'ONLINE':
        onlineKd += v;
        onlineOrders += oc;
        break;
      default:
        break;
    }
  }
  return {
    posTotalKd,
    collectedKd,
    onAccountKd,
    subscriptionWalletKd,
    paymentLinkKd,
    paymentLinkOrders,
    onlineKd,
    onlineOrders,
    subscriptionWalletOrders,
    collectionRatePct,
  };
}

function computeMoneyPulseFromPos(
  pos: DailyPosSalesByPaymentMethodReport | null,
): MoneyPulse {
  const rows = pos?.rows ?? [];
  const find = (m: string) =>
    toNum(rows.find((r) => r.posPaymentMethod === m)?.totalRevenue);
  return {
    cashKd: find('CASH'),
    knetKd: find('KNET'),
    linkKd: find('PAYMENT_LINK'),
    onlineKd: find('ONLINE'),
    subWalletKd: find('SUBSCRIPTION_WALLET'),
    debtKd: find('DEBT_ON_ACCOUNT'),
  };
}

type PressureLevel = 'light' | 'medium' | 'heavy';

function computeWorkPressure(
  p: {
    issuedCount: number;
    receivedToday: number;
    processing: number;
    grossRevenueKd: number;
    activeDrivers: number;
  },
): { score: number; level: PressureLevel } {
  const score = Math.min(
    100,
    Math.round(
      Math.min(30, p.issuedCount * 0.12) +
        Math.min(25, p.receivedToday * 0.6) +
        Math.min(15, p.processing * 0.4) +
        Math.min(20, p.grossRevenueKd * 0.02) +
        Math.min(10, p.activeDrivers * 0.5),
    ),
  );
  const level: PressureLevel =
    score >= 60 ? 'heavy' : score >= 30 ? 'medium' : 'light';
  return { score, level };
}

function Arrow({ delta }: { delta: number }) {
  if (delta > 0) return <ArrowUpRight className="h-5 w-5 text-emerald-400" aria-hidden />;
  if (delta < 0) return <ArrowDownRight className="h-5 w-5 text-rose-400" aria-hidden />;
  return <span className="h-5 w-5" aria-hidden />;
}

/**
 * V19.9.5 — Deliberate divergence from `@/modules/shared/components/page/KpiCard`.
 *
 * The shared primitive renders a white / light-theme card with a
 * muted label + dark value — perfect for finance, invoices, inventory
 * screens. This page is a fullscreen TV wallboard ("Safari Pulse")
 * with its own design language: black glassmorphism, neon accents,
 * ticking 9-second refresh. Forcing the light primitive here would
 * break the cockpit identity. The local `WallboardTile` keeps its
 * dark theme and accepts a delta arrow that the shared primitive
 * doesn't expose.
 */
function WallboardTile({
  title,
  value,
  delta,
  accent,
  icon,
  sub,
}: {
  title: string;
  value: string;
  delta: number;
  accent: 'emerald' | 'cyan' | 'rose' | 'amber' | 'indigo';
  icon: React.ReactNode;
  sub?: string;
}) {
  const accentClass =
    accent === 'emerald' ? 'text-emerald-300'
    : accent === 'cyan' ? 'text-cyan-300'
    : accent === 'rose' ? 'text-rose-300'
    : accent === 'amber' ? 'text-amber-300'
    : 'text-indigo-300';

  const ringClass =
    accent === 'emerald' ? 'ring-emerald-500/30'
    : accent === 'cyan' ? 'ring-cyan-500/30'
    : accent === 'rose' ? 'ring-rose-500/30'
    : accent === 'amber' ? 'ring-amber-500/30'
    : 'ring-indigo-500/30';

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-white/10 bg-black/35 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-xl',
        'ring-1',
        ringClass,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10',
              accentClass,
            )}
          >
            {icon}
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wide text-slate-300/90">
              {title}
            </p>
            {sub ? (
              <p className="text-[11px] text-slate-400">{sub}</p>
            ) : null}
          </div>
        </div>
        <Arrow delta={delta} />
      </div>
      <div className={cn('mt-4 text-4xl font-extrabold tabular-nums', accentClass)}>
        {value}
      </div>
    </div>
  );
}

function BranchLoadBars({
  branches,
  busyLabel,
  idleLabel,
  title,
  note,
  emptyMessage,
}: {
  branches: Array<{ branchId: string; branchName: string; isLive: boolean }>;
  busyLabel: string;
  idleLabel: string;
  title: string;
  note: string;
  emptyMessage: string;
}) {
  if (!branches.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/35 p-5 text-slate-400">
        {emptyMessage}
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-5 backdrop-blur-xl">
      <div className="mb-3 flex items-center gap-2 text-slate-200">
        <Signal className="h-5 w-5 text-cyan-300" aria-hidden />
        <span className="text-sm font-bold">{title}</span>
      </div>
      <div className="space-y-4" dir="rtl">
        {branches.map((b) => {
          const pct = b.isLive ? 82 : 18;
          const name = b.branchName?.trim() || '—';
          return (
            <div key={b.branchId} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p
                  className="min-w-0 flex-1 text-start text-sm font-bold leading-snug text-white"
                  title={name}
                >
                  {name}
                </p>
                <span
                  className={cn(
                    'shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold',
                    b.isLive ?
                      'border-emerald-500/30 bg-emerald-500/15 text-emerald-200'
                    : 'border-white/10 bg-white/5 text-slate-400',
                  )}
                >
                  {b.isLive ? busyLabel : idleLabel}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-white/10">
                <div
                  className={cn(
                    'h-2.5 rounded-full transition-[width] duration-500',
                    b.isLive ? 'bg-emerald-400/80' : 'bg-slate-500/50',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">{note}</p>
    </div>
  );
}

function TickerPill({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: 'emerald' | 'cyan' | 'amber' | 'rose' | 'violet' | 'slate';
  icon: React.ReactNode;
}) {
  const c =
    accent === 'emerald' ? 'ring-emerald-500/30 text-emerald-200'
    : accent === 'cyan' ? 'ring-cyan-500/30 text-cyan-200'
    : accent === 'amber' ? 'ring-amber-500/30 text-amber-200'
    : accent === 'rose' ? 'ring-rose-500/30 text-rose-200'
    : accent === 'violet' ? 'ring-violet-500/30 text-violet-200'
    : 'ring-white/20 text-slate-200';
  return (
    <div
      className={cn(
        'flex min-h-[4.5rem] flex-1 flex-col justify-between rounded-xl border border-white/10 bg-black/45 p-3 ring-1 backdrop-blur-sm',
        c,
      )}
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {icon}
        <span className="line-clamp-2 text-start">{label}</span>
      </div>
      <p className="mt-1 text-xl font-extrabold tabular-nums text-white">{value}</p>
      {sub ? (
        <p className="text-[10px] leading-tight text-slate-500">{sub}</p>
      ) : null}
    </div>
  );
}

function WorkPressureBar({
  score,
  level,
  t,
}: {
  score: number;
  level: PressureLevel;
  t: (k: string) => string;
}) {
  const { barClass, labelKey } =
    level === 'heavy' ?
      { barClass: 'from-rose-500 to-orange-500', labelKey: 'liveMonitorBoard.pressureHeavy' }
    : level === 'medium' ?
      { barClass: 'from-amber-400 to-amber-600', labelKey: 'liveMonitorBoard.pressureMedium' }
    : { barClass: 'from-emerald-500 to-emerald-700', labelKey: 'liveMonitorBoard.pressureLight' };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-4 ring-1 ring-white/10 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-slate-200">
          <Gauge className="h-5 w-5 text-cyan-300" aria-hidden />
          <div>
            <p className="text-sm font-bold">{t('liveMonitorBoard.workPressure')}</p>
            <p className="text-[11px] text-slate-500">{t('liveMonitorBoard.pressureHint')}</p>
          </div>
        </div>
        <div
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-extrabold tabular-nums',
            level === 'heavy' && 'bg-rose-500/20 text-rose-200',
            level === 'medium' && 'bg-amber-500/20 text-amber-200',
            level === 'light' && 'bg-emerald-500/20 text-emerald-200',
          )}
        >
          {t(labelKey)} · {score}
        </div>
      </div>
      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-500', barClass)}
          style={{ width: `${Math.min(100, score)}%` }}
        />
      </div>
    </div>
  );
}

export function LiveMonitorPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token, user, hasRole } = useAuth();

  /*
   * Dastur §2.1 — Radar is the live command center. Both OWNER (wallboard)
   * and ACCOUNTANT (bank-side reconciliation) may open it. Sales aggregates
   * only — net profit / P&L breakdown stays on OWNER-gated surfaces.
   */
  /*
   * Dastur §2.2 — Live monitor / Safari Pulse is an OWNER-only cockpit.
   * It exposes real-time net-profit-adjacent signals that must never leak
   * to ACCOUNTANT or any other role. Direct URL access by non-owners is
   * bounced back to the root.
   */
  const isOwner = hasRole('OWNER');
  if (!token || !user) return <Navigate to="/login" replace />;
  if (!isOwner) return <Navigate to="/" replace />;

  const [liveFeed, setLiveFeed] = useState<LiveFeedResponse | null>(null);
  const [branchesLive, setBranchesLive] = useState<BranchOperationsLiveResponse | null>(null);
  const [branchNameById, setBranchNameById] = useState<Record<string, string>>({});
  const [drivers, setDrivers] = useState<DriverMonitoringResponse | null>(null);
  const [posSplit, setPosSplit] = useState<DailyPosSalesByPaymentMethodReport | null>(null);
  const [executiveSummary, setExecutiveSummary] =
    useState<ExecutiveSummaryReport | null>(null);
  const [issuedReport, setIssuedReport] = useState<IssuedInvoicesReport | null>(null);
  const [openDebtReport, setOpenDebtReport] =
    useState<OpenDebtByIssuerReport | null>(null);
  const [moneyDeltas, setMoneyDeltas] = useState({
    cash: 0,
    knet: 0,
    link: 0,
    online: 0,
    subWallet: 0,
    debt: 0,
  });

  const [mock, setMock] = useState(() => ({ processingCount: 6 }));
  const [clockTick, setClockTick] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setClockTick(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const clockLabel = clockTick.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kuwait',
  });

  const prevMoneyRef = useRef<MoneyPulse | null>(null);

  /*
   * Dastur §2.2 — Radar "Ops Center" money cards must match the Unified
   * Ledger totals. Source: /api/finance/reports/daily-pos-sales (same
   * endpoint the Financials page uses), filtered per payment method.
   *   CASH / KNET / PAYMENT_LINK / ONLINE / SUBSCRIPTION_WALLET / DEBT_ON_ACCOUNT
   * No net-profit metric is displayed anywhere on this page, so
   * accountant-level privacy is preserved by construction.
   */
  const moneyPulse = useMemo<MoneyPulse>(
    () => computeMoneyPulseFromPos(posSplit),
    [posSplit],
  );

  const posDay = useMemo(() => computePosDayMetrics(posSplit), [posSplit]);

  const issuedTotalKd = useMemo(() => sumIssuedKd(issuedReport), [issuedReport]);

  const subscriptionSubsidyKd = useMemo(() => {
    if (!executiveSummary) return 0;
    return (
      toNum(executiveSummary.subscriptionSubsidyKd) +
      toNum(executiveSummary.enterpriseSubscriptionSubsidyKd)
    );
  }, [executiveSummary]);

  const grossRevenueTodayKd = useMemo(
    () => toNum(executiveSummary?.grossRevenueKd),
    [executiveSummary],
  );

  const pressure = useMemo(() => {
    return computeWorkPressure({
      issuedCount: issuedReport?.count ?? 0,
      receivedToday: liveFeed?.orders?.length ?? 0,
      processing: mock.processingCount,
      grossRevenueKd: grossRevenueTodayKd,
      activeDrivers: drivers?.drivers?.length ?? 0,
    });
  }, [
    issuedReport?.count,
    liveFeed?.orders?.length,
    mock.processingCount,
    grossRevenueTodayKd,
    drivers?.drivers?.length,
  ]);

  const branchLoadRows = useMemo(() => {
    return (branchesLive?.branches ?? [])
      .map((b) => ({
        ...b,
        branchName: branchNameById[b.branchId] ?? b.branchName ?? '—',
      }))
      .filter((b) => isPulseVisibleBranchName(b.branchName));
  }, [branchesLive, branchNameById]);

  const refresh = useCallback(async () => {
    const now = new Date();
    const dayFrom = startOfDayIso(now);
    const dayTo = endOfDayIso(now);
    const posQs = new URLSearchParams({ from: dayFrom, to: dayTo });
    const rangeQs = posQs.toString();

    const [feed, bLive, branchRows, drv, pos, exec, inv, oDebt] =
      await Promise.all([
        apiJson<LiveFeedResponse>('/api/reports/live-feed?limit=12', { token }),
        apiJson<BranchOperationsLiveResponse>('/api/branches/operations-live', {
          token,
        }),
        apiJson<BranchRow[]>('/api/branches', { token }),
        apiJson<DriverMonitoringResponse>('/api/finance/driver-monitoring', {
          token,
        }),
        apiJson<DailyPosSalesByPaymentMethodReport>(
          `/api/finance/reports/daily-pos-sales?${rangeQs}`,
          { token },
        ),
        apiJson<ExecutiveSummaryReport>(
          `/api/reports/executive-summary?${rangeQs}`,
          { token },
        ),
        apiJson<IssuedInvoicesReport>(`/api/reports/issued-invoices?${rangeQs}`, {
          token,
        }),
        apiJson<OpenDebtByIssuerReport>('/api/finance/reports/open-debt-by-issuer', {
          token,
        }),
      ]);

    setLiveFeed(feed ?? null);
    setBranchNameById(
      Object.fromEntries((branchRows ?? []).map((b) => [b.id, b.name])),
    );
    setBranchesLive(bLive ?? null);
    setDrivers(drv ?? null);
    setPosSplit(pos ?? null);
    setExecutiveSummary(exec ?? null);
    setIssuedReport(inv ?? null);
    setOpenDebtReport(oDebt ?? null);

    const newPulse = computeMoneyPulseFromPos(pos);
    const prev = prevMoneyRef.current;
    if (prev) {
      setMoneyDeltas({
        cash: newPulse.cashKd - prev.cashKd,
        knet: newPulse.knetKd - prev.knetKd,
        link: newPulse.linkKd - prev.linkKd,
        online: newPulse.onlineKd - prev.onlineKd,
        subWallet: newPulse.subWalletKd - prev.subWalletKd,
        debt: newPulse.debtKd - prev.debtKd,
      });
    } else {
      setMoneyDeltas({
        cash: 0,
        knet: 0,
        link: 0,
        online: 0,
        subWallet: 0,
        debt: 0,
      });
    }
    prevMoneyRef.current = newPulse;

    setMock((m) => {
      const jitter = (min: number, max: number) =>
        min + Math.random() * (max - min);
      const nextProcessing = Math.max(
        0,
        Math.round(m.processingCount + jitter(-2, 3)),
      );
      return { processingCount: nextProcessing };
    });
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    void refresh().catch(() => {});
    const id = window.setInterval(() => {
      if (!cancelled) void refresh().catch(() => {});
    }, 9_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [refresh]);

  const receivedToday = liveFeed?.orders?.length ?? 0;
  const processing = mock.processingCount;

  const activeDrivers = drivers?.drivers?.length ?? 0;
  const driversOnDelivery = Math.max(0, Math.round(activeDrivers * 0.6));
  const avgEta = activeDrivers ? 18 : 0;

  const actionLines = (liveFeed?.orders ?? []).map((o) => {
    const segs = [o.branchName, o.invoiceNumber, o.customerName]
      .map((s) => s?.trim())
      .filter((s): s is string => Boolean(s));
    return segs.length ? `• ${segs.join(' — ')}` : `• ${t('liveMonitorBoard.noEvents')}`;
  });

  const todayDateLabel = clockTick.toLocaleDateString('ar-KW', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kuwait',
  });

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden bg-[#05070f] text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -start-24 top-10 h-[26rem] w-[26rem] rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute end-0 top-1/3 h-[30rem] w-[30rem] rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-0 start-1/3 h-[26rem] w-[26rem] rounded-full bg-emerald-500/8 blur-3xl" />
      </div>

      <button
        type="button"
        onClick={() => navigate('/')}
        className="absolute end-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/30 text-slate-200 hover:bg-black/50"
        aria-label={t('liveMonitorBoard.exit')}
        title={t('liveMonitorBoard.exit')}
      >
        <X className="h-5 w-5" aria-hidden />
      </button>

      <div className="relative mx-auto flex h-full max-w-[1600px] flex-col overflow-y-auto px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
              <TrendingUp className="h-6 w-6 text-emerald-300" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">
                {t('liveMonitorBoard.pageTitle')}
              </h1>
              <p className="text-sm text-slate-400">
                {t('liveMonitorBoard.pageSubtitle')} · ~9s
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {t('liveMonitorBoard.todayRange')}: {todayDateLabel}
              </p>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
                {t('operatorHints.routes.liveMonitor')}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" aria-hidden />
              <span className="tabular-nums font-mono">{clockLabel}</span>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2 text-slate-300">
            <BarChart2 className="h-4 w-4 text-emerald-400" aria-hidden />
            <h2 className="text-sm font-bold tracking-wide">
              {t('liveMonitorBoard.marketStripTitle')}
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <TickerPill
              label={t('liveMonitorBoard.issuedInvoices')}
              value={issuedReport == null ? '—' : String(issuedReport.count)}
              sub={
                issuedReport != null && issuedReport.count > 0 ?
                  `${formatKwdLabel(issuedTotalKd.toFixed(3))} · ${t('liveMonitorBoard.issuedCount')}`
                : undefined
              }
              accent="slate"
              icon={<Receipt className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            />
            <TickerPill
              label={t('liveMonitorBoard.collection')}
              value={formatKwdLabel(posDay.collectedKd.toFixed(3))}
              sub={t('liveMonitorBoard.collectionHint')}
              accent="emerald"
              icon={<Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            />
            <TickerPill
              label={t('liveMonitorBoard.paymentLinkCollected')}
              value={formatKwdLabel(posDay.paymentLinkKd.toFixed(3))}
              sub={t('liveMonitorBoard.opsCount', {
                count: posDay.paymentLinkOrders,
              })}
              accent="cyan"
              icon={<Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            />
            <TickerPill
              label={t('liveMonitorBoard.subscriptionWalletDeduction')}
              value={formatKwdLabel(posDay.subscriptionWalletKd.toFixed(3))}
              sub={t('liveMonitorBoard.opsCount', {
                count: posDay.subscriptionWalletOrders,
              })}
              accent="violet"
              icon={<Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            />
            <TickerPill
              label={t('liveMonitorBoard.subscriptionSubsidyDay')}
              value={formatKwdLabel(subscriptionSubsidyKd.toFixed(3))}
              sub={t('liveMonitorBoard.subscriptionSubsidyDaySub')}
              accent="amber"
              icon={<Landmark className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            />
            <TickerPill
              label={t('liveMonitorBoard.openDebt')}
              value={formatKwdLabel(toNum(openDebtReport?.totalOpenDebtKd).toFixed(3))}
              sub={t('liveMonitorBoard.openDebtHint')}
              accent="rose"
              icon={<Activity className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            />
            <TickerPill
              label={t('liveMonitorBoard.collectionRate')}
              value={
                posDay.posTotalKd > 0 ? `${posDay.collectionRatePct.toFixed(1)}%` : '—'
              }
              sub={t('liveMonitorBoard.collectionRateHint')}
              accent="cyan"
              icon={<Gauge className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            />
            <TickerPill
              label={t('liveMonitorBoard.executiveGross')}
              value={formatKwdLabel(grossRevenueTodayKd.toFixed(3))}
              sub={t('liveMonitorBoard.grossRevenueSub')}
              accent="slate"
              icon={<TrendingUp className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            />
          </div>
        </div>

        <div className="mt-4 max-w-2xl">
          <WorkPressureBar score={pressure.score} level={pressure.level} t={t} />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-12">
            <h2 className="mb-3 text-sm font-bold tracking-wide text-slate-300">
              {t('liveMonitorBoard.moneyPulse')}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <WallboardTile
                title={t('radar.totalCash')}
                value={formatKwdLabel(moneyPulse.cashKd.toFixed(3))}
                delta={moneyDeltas.cash}
                accent="emerald"
                icon={<Receipt className="h-5 w-5" aria-hidden />}
                sub={t('radar.totalCashSub')}
              />
              <WallboardTile
                title={t('radar.totalKnet')}
                value={formatKwdLabel(moneyPulse.knetKd.toFixed(3))}
                delta={moneyDeltas.knet}
                accent="cyan"
                icon={<Landmark className="h-5 w-5" aria-hidden />}
                sub={t('radar.totalKnetSub')}
              />
              <WallboardTile
                title={t('radar.totalPaymentLink')}
                value={formatKwdLabel(moneyPulse.linkKd.toFixed(3))}
                delta={moneyDeltas.link}
                accent="amber"
                icon={<Link2 className="h-5 w-5" aria-hidden />}
                sub={t('radar.totalPaymentLinkSub')}
              />
              <WallboardTile
                title={t('radar.totalOnline')}
                value={formatKwdLabel(moneyPulse.onlineKd.toFixed(3))}
                delta={moneyDeltas.online}
                accent="cyan"
                icon={<Smartphone className="h-5 w-5" aria-hidden />}
                sub={t('radar.totalOnlineSub')}
              />
              <WallboardTile
                title={t('radar.totalSubWallet')}
                value={formatKwdLabel(moneyPulse.subWalletKd.toFixed(3))}
                delta={moneyDeltas.subWallet}
                accent="indigo"
                icon={<Wallet className="h-5 w-5" aria-hidden />}
                sub={t('radar.totalSubWalletSub')}
              />
              <WallboardTile
                title={t('radar.totalDebt')}
                value={formatKwdLabel(moneyPulse.debtKd.toFixed(3))}
                delta={moneyDeltas.debt}
                accent="rose"
                icon={<Wallet className="h-5 w-5" aria-hidden />}
                sub={t('radar.totalDebtSub')}
              />
            </div>
          </div>

          <div className="lg:col-span-7">
            <h2 className="mb-3 text-sm font-bold tracking-wide text-slate-300">
              {t('liveMonitorBoard.laundryPulse')}
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <WallboardTile
                title={t('liveMonitorBoard.receivedToday')}
                value={String(receivedToday)}
                delta={0}
                accent="indigo"
                icon={<Receipt className="h-5 w-5" aria-hidden />}
              />
              <WallboardTile
                title={t('liveMonitorBoard.processing')}
                value={String(processing)}
                delta={0}
                accent="amber"
                icon={<Activity className="h-5 w-5" aria-hidden />}
              />
            </div>
            <div className="mt-4">
              <BranchLoadBars
                branches={branchLoadRows}
                busyLabel={t('liveMonitorBoard.busy')}
                idleLabel={t('liveMonitorBoard.idle')}
                title={t('liveMonitorBoard.branchLoad')}
                note={t('liveMonitorBoard.branchLoadNote')}
                emptyMessage={t('liveMonitorBoard.branchLoadEmpty')}
              />
            </div>
          </div>

          <div className="lg:col-span-5">
            <h2 className="mb-3 text-sm font-bold tracking-wide text-slate-300">
              {t('liveMonitorBoard.fleetPulse')}
            </h2>
            <div className="grid gap-4">
              <WallboardTile
                title={t('liveMonitorBoard.activeDrivers')}
                value={String(activeDrivers)}
                delta={0}
                accent="emerald"
                icon={<Car className="h-5 w-5" aria-hidden />}
              />
              <WallboardTile
                title={t('liveMonitorBoard.onDelivery')}
                value={String(driversOnDelivery)}
                delta={0}
                accent="cyan"
                icon={<Signal className="h-5 w-5" aria-hidden />}
              />
              <WallboardTile
                title={t('liveMonitorBoard.avgEta')}
                value={avgEta ? `${avgEta}m` : '—'}
                delta={0}
                accent="indigo"
                icon={<Clock className="h-5 w-5" aria-hidden />}
              />
            </div>
          </div>

          <div className="lg:col-span-12">
            <h2 className="mb-3 text-sm font-bold tracking-wide text-slate-300">
              {t('liveMonitorBoard.liveLog')}
            </h2>
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/35 p-4 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-200">
                  <Activity className="h-5 w-5 text-emerald-300" aria-hidden />
                  <span className="text-sm font-bold">
                    {t('liveMonitorBoard.liveLog')}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400">
                  {t('liveMonitorBoard.displayOnly')} · {t('liveMonitorBoard.autoScroll')}
                </span>
              </div>

              <div className="mt-3 h-20 overflow-hidden">
                <div className="animate-[pulseMarquee_18s_linear_infinite] whitespace-nowrap text-sm text-slate-200">
                  {(
                    actionLines.length ?
                      actionLines
                    : [`• ${t('liveMonitorBoard.noEvents')}.`]
                  )
                    .concat(
                      actionLines.length ?
                        actionLines
                      : [`• ${t('liveMonitorBoard.noEvents')}.`],
                    )
                    .join('   ')}
                </div>
              </div>

              <style>{`
                @keyframes pulseMarquee {
                  0% { transform: translateX(0%); }
                  100% { transform: translateX(-50%); }
                }
              `}</style>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

