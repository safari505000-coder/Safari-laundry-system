import { type ReactElement, type ReactNode } from 'react';

/**
 * V20.7 — Phase 3 / 8 EmptyState.
 *
 * Standardised empty-state for any financial surface. Distinguishes
 * "no data because everything is fine" (e.g. zero debt) from
 * "no data because of a filter" (e.g. no rows match) via the
 * `tone` prop.
 */

export type EmptyStateTone = 'success' | 'neutral' | 'warning';

export type EmptyStateProps = {
  title: string;
  description?: string;
  tone?: EmptyStateTone;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
};

const TONE_KLASS: Record<EmptyStateTone, string> = {
  success: 'text-emerald-700 dark:text-emerald-300',
  neutral: 'text-slate-700 dark:text-slate-200',
  warning: 'text-amber-700 dark:text-amber-300',
};

export function EmptyState(props: EmptyStateProps): ReactElement {
  const tone = props.tone ?? 'neutral';
  return (
    <div
      role="status"
      aria-label={props.title}
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center dark:border-slate-700 dark:bg-slate-800/30 ${
        props.className ?? ''
      }`}
    >
      {props.icon ? <div className="opacity-60">{props.icon}</div> : null}
      <h4 className={`text-sm font-semibold ${TONE_KLASS[tone]}`}>{props.title}</h4>
      {props.description ? (
        <p className="max-w-sm text-xs text-slate-600 dark:text-slate-400">
          {props.description}
        </p>
      ) : null}
      {props.action ? <div className="mt-2">{props.action}</div> : null}
    </div>
  );
}
