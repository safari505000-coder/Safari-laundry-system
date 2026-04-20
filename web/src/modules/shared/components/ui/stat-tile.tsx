import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Stage-F Cosmetic — card taxonomy.
 *
 * `StatTile` is the inline "mini-stat" we keep re-inventing inside
 * card bodies (ConsolidatedCashCard, FinancialCycleCard, InsightsAi,
 * etc.). Every flavour was doing the same thing with slightly
 * different classNames — now they all share one component with
 * token-aware tones so they flip correctly in dark mode.
 *
 * It is intentionally NOT an outer <Card>: that's what `MetricCard`
 * (`components/dashboard/metric-card.tsx`) is for. Use `StatTile`
 * when you need 3–6 small figures in a grid inside another card.
 */

export type StatTileTone =
  | 'neutral'   // default — muted surface, primary text
  | 'primary'   // branded — sapphire tint
  | 'success'   // emerald
  | 'warning'   // amber
  | 'danger'    // rose
  | 'highlight'; // amber, used when value crosses a threshold

const TONE_CLASSES: Record<StatTileTone, string> = {
  neutral:
    'border-border bg-muted/40 text-foreground',
  primary:
    'border-primary/25 bg-primary/5 text-foreground',
  success:
    'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-100',
  warning:
    'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100',
  danger:
    'border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-100',
  highlight:
    'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100',
};

const LABEL_CLASSES: Record<StatTileTone, string> = {
  neutral: 'text-muted-foreground',
  primary: 'text-muted-foreground',
  success: 'text-emerald-800 dark:text-emerald-200/80',
  warning: 'text-amber-800 dark:text-amber-200/80',
  danger: 'text-rose-800 dark:text-rose-200/80',
  highlight: 'text-amber-800 dark:text-amber-200/80',
};

type StatTileProps = {
  label: ReactNode;
  value: ReactNode;
  /** Tiny caption under the value, e.g. KWD sub-currency breakdown. */
  sub?: ReactNode;
  tone?: StatTileTone;
  /** When true, renders the value with `font-mono tabular-nums`. */
  mono?: boolean;
  /** Density of the tile. `compact` removes the larger padding. */
  size?: 'md' | 'compact';
  className?: string;
};

export function StatTile({
  label,
  value,
  sub,
  tone = 'neutral',
  mono,
  size = 'md',
  className,
}: StatTileProps) {
  return (
    <div
      className={cn(
        'rounded-xl border',
        size === 'md' ? 'px-4 py-3' : 'p-3',
        TONE_CLASSES[tone],
        className,
      )}
    >
      <div
        className={cn(
          'text-xs font-semibold',
          LABEL_CLASSES[tone],
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          'mt-1 font-bold tabular-nums',
          size === 'md' ? 'text-base' : 'text-lg',
          mono && 'font-mono',
        )}
      >
        {value}
      </div>
      {sub ? (
        <p className={cn('mt-0.5 text-[11px]', LABEL_CLASSES[tone])}>{sub}</p>
      ) : null}
    </div>
  );
}
