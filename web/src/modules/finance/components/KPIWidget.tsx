import { type ReactElement, type ReactNode } from 'react';

/**
 * V20.7 — Phase 3 KPIWidget.
 *
 * Standardised KPI card for dashboards (owner / GM / accountant /
 * collections workspace). Accepts a server-canonical pre-formatted
 * value string — performs ZERO numeric transformation.
 */

export type KPITone = 'neutral' | 'success' | 'warn' | 'danger' | 'info';

const TONE_BG: Record<KPITone, string> = {
  neutral: 'bg-slate-50 dark:bg-slate-800/40',
  success: 'bg-emerald-50 dark:bg-emerald-950/30',
  warn: 'bg-amber-50 dark:bg-amber-950/30',
  danger: 'bg-rose-50 dark:bg-rose-950/30',
  info: 'bg-blue-50 dark:bg-blue-950/30',
};

const TONE_VALUE: Record<KPITone, string> = {
  neutral: 'text-slate-900 dark:text-slate-100',
  success: 'text-emerald-700 dark:text-emerald-300',
  warn: 'text-amber-700 dark:text-amber-300',
  danger: 'text-rose-700 dark:text-rose-300',
  info: 'text-blue-700 dark:text-blue-300',
};

export type KPIWidgetProps = {
  label: string;
  value: string;
  /** Optional secondary line (e.g. unit, comparison, percentage). */
  subValue?: string;
  /** Optional small badge (e.g. trend Δ). */
  trend?: ReactNode;
  tone?: KPITone;
  /** Optional click handler — turns the widget into a button. */
  onClick?: () => void;
  className?: string;
  ariaLabel?: string;
};

export function KPIWidget(props: KPIWidgetProps): ReactElement {
  const tone = props.tone ?? 'neutral';
  const Wrapper = (props.onClick ? 'button' : 'div') as 'button' | 'div';
  return (
    <Wrapper
      type={props.onClick ? 'button' : undefined}
      onClick={props.onClick}
      aria-label={props.ariaLabel ?? `${props.label}: ${props.value}`}
      className={`flex flex-col gap-1 rounded-xl border border-slate-200 p-3 text-start shadow-sm transition dark:border-slate-700 ${TONE_BG[tone]} ${
        props.onClick ? 'cursor-pointer hover:brightness-95' : ''
      } ${props.className ?? ''}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[0.65rem] uppercase tracking-wide text-slate-600 dark:text-slate-400">
          {props.label}
        </span>
        {props.trend ? <span className="shrink-0">{props.trend}</span> : null}
      </div>
      <span className={`text-xl font-bold tabular-nums ${TONE_VALUE[tone]}`}>
        {props.value}
      </span>
      {props.subValue ? (
        <span className="text-[0.7rem] text-slate-500 dark:text-slate-400">
          {props.subValue}
        </span>
      ) : null}
    </Wrapper>
  );
}
