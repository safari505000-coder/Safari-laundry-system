import * as React from 'react';
import {
  Activity,
  CircleDot,
  Loader2,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RealtimeFeedState } from '@/modules/finance';

/**
 * V23 Phase 6 — Realtime Status Badge.
 *
 * Visibility-only operational telemetry chip. Consumes the standard
 * `RealtimeFeedState` shape returned by `useRealtimeFinancialFeed`
 * and renders a single-glance health indicator for the operator.
 *
 * Strict invariants:
 *   • No money. No business effects.
 *   • No mutation triggers (the badge does not re-connect on click —
 *     reconnection is the hook's responsibility).
 *
 * States rendered:
 *   live    — connected, last event recent
 *   idle    — connected, no events for ≥ STALE_AFTER_MS (heartbeat OK)
 *   stale   — connected but lastEvent is much older than STALE_AFTER_MS
 *   offline — not connected, reconnects pending
 *   error   — not connected, last attempt failed
 */

export type RealtimeBadgeStatus = 'live' | 'idle' | 'stale' | 'offline' | 'error';

const STALE_AFTER_MS = 60_000;
const VERY_STALE_AFTER_MS = 5 * 60_000;

const TONE_CLASSES: Readonly<Record<RealtimeBadgeStatus, string>> = {
  live:
    'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200',
  idle:
    'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-200',
  stale:
    'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200',
  offline:
    'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800/60 dark:bg-slate-950/40 dark:text-slate-200',
  error:
    'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-200',
};

const LABEL_AR: Readonly<Record<RealtimeBadgeStatus, string>> = {
  live: 'مباشر',
  idle: 'متّصل (هادئ)',
  stale: 'تدفّق متأخّر',
  offline: 'إعادة اتصال…',
  error: 'تعذّر الاتصال',
};

const ICON_FOR: Readonly<
  Record<RealtimeBadgeStatus, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>>
> = {
  live: Activity,
  idle: CircleDot,
  stale: RefreshCw,
  offline: Loader2,
  error: WifiOff,
};

export function classifyRealtimeStatus(
  state: RealtimeFeedState,
  now: number = Date.now(),
): { status: RealtimeBadgeStatus; ageMs: number | null } {
  if (!state.connected) {
    return {
      status: state.error ? 'error' : 'offline',
      ageMs: null,
    };
  }
  if (!state.lastEventAt) {
    return { status: 'idle', ageMs: null };
  }
  const last = Date.parse(state.lastEventAt);
  if (Number.isNaN(last)) {
    return { status: 'idle', ageMs: null };
  }
  const ageMs = Math.max(0, now - last);
  if (ageMs >= VERY_STALE_AFTER_MS) {
    return { status: 'stale', ageMs };
  }
  if (ageMs >= STALE_AFTER_MS) {
    return { status: 'idle', ageMs };
  }
  return { status: 'live', ageMs };
}

export interface RealtimeStatusBadgeProps {
  state: RealtimeFeedState;
  /** Optional `now` for tests / SSR. */
  now?: number;
  className?: string;
  compact?: boolean;
}

export const RealtimeStatusBadge: React.FC<RealtimeStatusBadgeProps> = ({
  state,
  now,
  className,
  compact,
}) => {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);
  void tick;

  const { status, ageMs } = classifyRealtimeStatus(state, now);
  const Icon = ICON_FOR[status];
  const animate = status === 'offline' ? 'animate-spin' : status === 'live' ? 'animate-pulse' : '';

  const detail =
    state.reconnects > 0 ? `${state.reconnects} إعادة اتصال` : null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="realtime-status-badge"
      data-status={status}
      title={
        ageMs != null
          ? `آخر حدث: ${Math.round(ageMs / 1000)}ث`
          : LABEL_AR[status]
      }
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.65rem] font-medium',
        TONE_CLASSES[status],
        className,
      )}
    >
      <Icon className={cn('size-3', animate)} aria-hidden />
      {!compact && <span>{LABEL_AR[status]}</span>}
      {!compact && detail ? (
        <span className="opacity-70">· {detail}</span>
      ) : null}
    </div>
  );
};

RealtimeStatusBadge.displayName = 'RealtimeStatusBadge';
