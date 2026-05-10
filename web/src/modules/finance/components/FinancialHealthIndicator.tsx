import { type ReactElement } from 'react';

/**
 * V20.6 — Phase 6B FinancialHealthIndicator.
 *
 * Compact "system status pill" that mirrors the
 * /api/finance/observability/overview health score (0-100).
 *
 * Used in the global topbar / dashboard headers so every operator
 * sees system-wide financial health at a glance.
 */

export type FinancialHealthIndicatorProps = {
  score: number;
  driftCount?: number;
  fraudAlerts?: number;
  snapshotLagSec?: number;
  onClick?: () => void;
  className?: string;
  locale?: 'en' | 'ar';
};

function classifyScore(score: number): {
  label: string;
  klass: string;
  pulse: boolean;
} {
  if (score >= 90) {
    return {
      label: 'صحّي',
      klass: 'bg-emerald-50 text-emerald-800 ring-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800',
      pulse: false,
    };
  }
  if (score >= 70) {
    return {
      label: 'جيد',
      klass: 'bg-blue-50 text-blue-800 ring-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800',
      pulse: false,
    };
  }
  if (score >= 50) {
    return {
      label: 'تحذير',
      klass: 'bg-amber-50 text-amber-800 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800',
      pulse: false,
    };
  }
  return {
    label: 'حرِج',
    klass: 'bg-rose-50 text-rose-800 ring-rose-400 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-700',
    pulse: true,
  };
}

export function FinancialHealthIndicator(
  props: FinancialHealthIndicatorProps,
): ReactElement {
  const score = Math.max(0, Math.min(100, Math.round(props.score)));
  const preset = classifyScore(score);
  const Wrapper = (props.onClick ? 'button' : 'div') as 'button' | 'div';
  return (
    <Wrapper
      type={props.onClick ? 'button' : undefined}
      onClick={props.onClick}
      aria-label={`Financial health score: ${score} / 100 (${preset.label})`}
      title={`Health: ${preset.label} (${score}/100)`}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
        preset.klass
      } ${props.onClick ? 'cursor-pointer hover:brightness-95' : ''} ${
        props.className ?? ''
      }`}
    >
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full bg-current ${preset.pulse ? 'animate-pulse' : ''}`}
      />
      <span>FIN {score}</span>
      {props.driftCount != null && props.driftCount > 0 ? (
        <span className="rounded-full bg-rose-600/20 px-1.5 py-0 text-[0.6rem] font-bold text-rose-800 dark:text-rose-300">
          drift {props.driftCount}
        </span>
      ) : null}
      {props.fraudAlerts != null && props.fraudAlerts > 0 ? (
        <span className="rounded-full bg-orange-600/20 px-1.5 py-0 text-[0.6rem] font-bold text-orange-800 dark:text-orange-300">
          fraud {props.fraudAlerts}
        </span>
      ) : null}
      {props.snapshotLagSec != null && props.snapshotLagSec > 60 ? (
        <span className="rounded-full bg-amber-600/20 px-1.5 py-0 text-[0.6rem] font-bold text-amber-800 dark:text-amber-300">
          lag {Math.round(props.snapshotLagSec)}s
        </span>
      ) : null}
    </Wrapper>
  );
}
