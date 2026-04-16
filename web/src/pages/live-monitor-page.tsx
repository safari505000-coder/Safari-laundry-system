import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Car,
  Clock,
  Receipt,
  Signal,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  type BranchOperationsLiveResponse,
  type DriverMonitoringResponse,
  type ExecutiveSummaryReport,
  type LiveFeedResponse,
  apiJson,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { cn } from '@/lib/utils';

type MoneyPulse = {
  cashKd: number;
  digitalKd: number;
  newDebtKd: number;
};

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function Arrow({ delta }: { delta: number }) {
  if (delta > 0) return <ArrowUpRight className="h-5 w-5 text-emerald-400" aria-hidden />;
  if (delta < 0) return <ArrowDownRight className="h-5 w-5 text-rose-400" aria-hidden />;
  return <span className="h-5 w-5" aria-hidden />;
}

function KpiCard({
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
}: {
  branches: Array<{ branchId: string; isLive: boolean }>;
}) {
  if (!branches.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/35 p-5 text-slate-400">
        No branch load data yet.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-5 backdrop-blur-xl">
      <div className="mb-3 flex items-center gap-2 text-slate-200">
        <Signal className="h-5 w-5 text-cyan-300" aria-hidden />
        <span className="text-sm font-bold">Branch Load</span>
      </div>
      <div className="space-y-3">
        {branches.map((b) => {
          const pct = b.isLive ? 82 : 18;
          return (
            <div key={b.branchId} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-slate-300">
                  {b.branchId.slice(0, 8)}
                </span>
                <span className={b.isLive ? 'text-emerald-300' : 'text-slate-400'}>
                  {b.isLive ? 'BUSY' : 'IDLE'}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/10">
                <div
                  className={cn(
                    'h-2 rounded-full',
                    b.isLive ? 'bg-emerald-400/80' : 'bg-slate-500/50',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">
        Live status uses the branch “operations-live” endpoint; bar fill is a visual indicator.
      </p>
    </div>
  );
}

export function LiveMonitorPage() {
  const navigate = useNavigate();
  const { token, user, hasRole } = useAuth();

  const isOwner = hasRole('OWNER');
  if (!token || !user) return <Navigate to="/login" replace />;
  if (!isOwner) return <Navigate to="/" replace />;

  const [executive, setExecutive] = useState<ExecutiveSummaryReport | null>(null);
  const [liveFeed, setLiveFeed] = useState<LiveFeedResponse | null>(null);
  const [branchesLive, setBranchesLive] = useState<BranchOperationsLiveResponse | null>(null);
  const [drivers, setDrivers] = useState<DriverMonitoringResponse | null>(null);

  const [mock, setMock] = useState(() => ({
    processingCount: 6,
    newDebtKd: 12.5,
  }));

  const prevMoneyRef = useRef<MoneyPulse | null>(null);
  const moneyPulse = useMemo<MoneyPulse>(() => {
    // Realistic heuristic using existing executive summary:
    // - cash: approximate grossRevenue * 0.35 (mocked split)
    // - digital: approximate grossRevenue * 0.65 (mocked split)
    const gross = toNum(executive?.grossRevenueKd);
    const cash = gross * 0.35;
    const digital = gross * 0.65;
    return {
      cashKd: cash,
      digitalKd: digital,
      newDebtKd: mock.newDebtKd,
    };
  }, [executive, mock.newDebtKd]);

  const deltas = useMemo(() => {
    const prev = prevMoneyRef.current;
    return {
      cash: prev ? moneyPulse.cashKd - prev.cashKd : 0,
      digital: prev ? moneyPulse.digitalKd - prev.digitalKd : 0,
      debt: prev ? moneyPulse.newDebtKd - prev.newDebtKd : 0,
    };
  }, [moneyPulse]);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const refresh = useCallback(async () => {
    const qs = new URLSearchParams();
    qs.set('from', todayIso);
    qs.set('to', todayIso);

    const [exec, feed, bLive, drv] = await Promise.all([
      apiJson<ExecutiveSummaryReport>(`/api/reports/executive-summary?${qs.toString()}`, { token }),
      apiJson<LiveFeedResponse>('/api/reports/live-feed?limit=12', { token }),
      apiJson<BranchOperationsLiveResponse>('/api/branches/operations-live', { token }),
      apiJson<DriverMonitoringResponse>('/api/finance/driver-monitoring', { token }),
    ]);

    setExecutive(exec ?? null);
    setLiveFeed(feed ?? null);
    setBranchesLive(bLive ?? null);
    setDrivers(drv ?? null);

    // Update mock pulse values to simulate “pulsing” where live endpoints do not exist yet.
    setMock((m) => {
      const jitter = (min: number, max: number) =>
        min + Math.random() * (max - min);
      const nextDebt = Math.max(0, +(m.newDebtKd + jitter(-3.2, 4.8)).toFixed(3));
      const nextProcessing = Math.max(
        0,
        Math.round(m.processingCount + jitter(-2, 3)),
      );
      return { processingCount: nextProcessing, newDebtKd: nextDebt };
    });

    prevMoneyRef.current = moneyPulse;
  }, [todayIso, token, moneyPulse]);

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
    const inv = o.invoiceNumber?.trim() || `#${o.id.slice(0, 8)}`;
    const branch = o.branchName ?? '—';
    return `• ${branch} received order ${inv} (${o.customerName})`;
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
        aria-label="Exit"
        title="Exit"
      >
        <X className="h-5 w-5" aria-hidden />
      </button>

      <div className="relative mx-auto flex h-full max-w-[1400px] flex-col px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
              <Activity className="h-6 w-6 text-cyan-300" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">
                نبض سفاري · Safari Pulse
              </h1>
              <p className="text-sm text-slate-400">
                Live command center (Owner wallboard) · Auto-refresh every ~9s
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Clock className="h-4 w-4" aria-hidden />
            <span className="tabular-nums">{new Date().toLocaleTimeString()}</span>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-12">
          {/* Money Pulse */}
          <div className="lg:col-span-12">
            <h2 className="mb-3 text-sm font-bold tracking-wide text-slate-300">
              The Money Pulse
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              <KpiCard
                title="Today's Cash"
                value={formatKwdLabel(moneyPulse.cashKd.toFixed(3))}
                delta={deltas.cash}
                accent="emerald"
                icon={<Receipt className="h-5 w-5" aria-hidden />}
                sub="Heuristic split from gross revenue"
              />
              <KpiCard
                title="Today's K-Net / Online"
                value={formatKwdLabel(moneyPulse.digitalKd.toFixed(3))}
                delta={deltas.digital}
                accent="cyan"
                icon={<Signal className="h-5 w-5" aria-hidden />}
                sub="Heuristic split from gross revenue"
              />
              <KpiCard
                title="New Debt"
                value={formatKwdLabel(moneyPulse.newDebtKd.toFixed(3))}
                delta={deltas.debt}
                accent="rose"
                icon={<Activity className="h-5 w-5" aria-hidden />}
                sub="Mock pulse until live debt endpoint exists"
              />
            </div>
          </div>

          {/* Laundry Pulse */}
          <div className="lg:col-span-7">
            <h2 className="mb-3 text-sm font-bold tracking-wide text-slate-300">
              The Laundry Pulse
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <KpiCard
                title="Orders received today"
                value={String(receivedToday)}
                delta={0}
                accent="indigo"
                icon={<Receipt className="h-5 w-5" aria-hidden />}
              />
              <KpiCard
                title="Orders in processing"
                value={String(processing)}
                delta={0}
                accent="amber"
                icon={<Activity className="h-5 w-5" aria-hidden />}
                sub="Mock pulse until processing endpoint exists"
              />
            </div>
            <div className="mt-4">
              <BranchLoadBars branches={branchesLive?.branches ?? []} />
            </div>
          </div>

          {/* Fleet Pulse */}
          <div className="lg:col-span-5">
            <h2 className="mb-3 text-sm font-bold tracking-wide text-slate-300">
              The Fleet Pulse
            </h2>
            <div className="grid gap-4">
              <KpiCard
                title="Active drivers (online)"
                value={String(activeDrivers)}
                delta={0}
                accent="emerald"
                icon={<Car className="h-5 w-5" aria-hidden />}
                sub="From /api/finance/driver-monitoring"
              />
              <KpiCard
                title="Drivers on delivery"
                value={String(driversOnDelivery)}
                delta={0}
                accent="cyan"
                icon={<Signal className="h-5 w-5" aria-hidden />}
                sub="Estimated ratio (mock)"
              />
              <KpiCard
                title="Average delivery status (ETA)"
                value={avgEta ? `${avgEta}m` : '—'}
                delta={0}
                accent="indigo"
                icon={<Clock className="h-5 w-5" aria-hidden />}
                sub="Mock until driver ETA endpoint exists"
              />
            </div>
          </div>

          {/* Live Action Log */}
          <div className="lg:col-span-12">
            <h2 className="mb-3 text-sm font-bold tracking-wide text-slate-300">
              Live Action Log
            </h2>
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/35 p-4 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-200">
                  <Activity className="h-5 w-5 text-emerald-300" aria-hidden />
                  <span className="text-sm font-bold">Latest events</span>
                </div>
                <span className="text-[11px] text-slate-400">
                  Display only · auto-scroll
                </span>
              </div>

              <div className="mt-3 h-20 overflow-hidden">
                <div className="animate-[pulseMarquee_18s_linear_infinite] whitespace-nowrap text-sm text-slate-200">
                  {(actionLines.length ? actionLines : ['• No recent events yet.'])
                    .concat(actionLines.length ? actionLines : ['• No recent events yet.'])
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

