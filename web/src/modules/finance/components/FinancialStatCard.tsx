import { type ReactElement } from 'react';
import { formatKwdAmount } from '@/lib/kwd';

/**
 * V20.7 — Phase 3 FinancialStatCard.
 *
 * Slightly heavier sibling of `KPIWidget` — for a single hero stat
 * with a unit suffix, an optional comparison subline, and a sparkline
 * slot. Used at the top of finance dashboards.
 */

export type FinancialStatCardProps = {
  label: string;
  /** Pre-formatted numeric string, server-canonical (e.g. "12,345.678"). */
  value: string;
  /** Currency / unit suffix (e.g. "د.ك" or "%"). */
  unit?: string;
  /** Subline — e.g. "+5% vs last month". */
  delta?: { text: string; tone: 'up' | 'down' | 'neutral' };
  className?: string;
};

const DELTA_KLASS: Record<'up' | 'down' | 'neutral', string> = {
  up: 'text-emerald-700 dark:text-emerald-300',
  down: 'text-rose-700 dark:text-rose-300',
  neutral: 'text-slate-600 dark:text-slate-400',
};

export function FinancialStatCard(props: FinancialStatCardProps): ReactElement {
  const value =
    props.unit === 'د.ك' || props.unit?.toUpperCase() === 'KWD' ?
      formatKwdAmount(props.value)
    : props.value;
  return (
    <article
      className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 ${
        props.className ?? ''
      }`}
      aria-label={`${props.label}: ${value}${props.unit ? ' ' + props.unit : ''}`}
    >
      <header className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {props.label}
      </header>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
          {value}
        </span>
        {props.unit ? (
          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            {props.unit}
          </span>
        ) : null}
      </div>
      {props.delta ? (
        <p className={`mt-1 text-xs font-semibold ${DELTA_KLASS[props.delta.tone]}`}>
          {props.delta.text}
        </p>
      ) : null}
    </article>
  );
}
