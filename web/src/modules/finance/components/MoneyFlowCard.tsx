import { type ReactElement } from 'react';
import { formatKwdAmount } from '@/lib/kwd';

/**
 * V20.6 — Phase 6B MoneyFlowCard.
 *
 * Side-by-side cash IN / cash OUT widget for any time window.
 * All numbers must come pre-aggregated from the Journal — this
 * component performs ZERO arithmetic on debt/AR.
 */

export type MoneyFlowCardProps = {
  title: string;
  subtitle?: string;
  cashInKd: string | number;
  cashOutKd: string | number;
  /** Server-canonical net cash flow for the same window. */
  netKd: string | number;
  windowLabel?: string;
  locale?: 'en' | 'ar';
  className?: string;
};

export function MoneyFlowCard(props: MoneyFlowCardProps): ReactElement {
  const isAr = (props.locale ?? 'ar') === 'ar';
  const netIsNegative = String(props.netKd).trim().startsWith('-');
  const labels = isAr
    ? { in: 'داخل', out: 'خارج', net: 'صافي' }
    : { in: 'Inflow', out: 'Outflow', net: 'Net' };
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 ${
        props.className ?? ''
      }`}
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <header className="mb-3">
        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{props.title}</h4>
        {props.subtitle ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">{props.subtitle}</p>
        ) : null}
        {props.windowLabel ? (
          <p className="mt-0.5 text-[0.65rem] uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {props.windowLabel}
          </p>
        ) : null}
      </header>
      <div className="grid grid-cols-3 gap-2">
        <Cell
          label={labels.in}
          value={formatKwdAmount(props.cashInKd)}
          tone="emerald"
          prefix="+"
        />
        <Cell
          label={labels.out}
          value={formatKwdAmount(props.cashOutKd)}
          tone="rose"
          prefix="−"
        />
        <Cell
          label={labels.net}
          value={formatKwdAmount(String(props.netKd).replace(/^-/, ''))}
          tone={netIsNegative ? 'rose' : 'emerald'}
          prefix={netIsNegative ? '−' : '+'}
        />
      </div>
    </section>
  );
}

function Cell({
  label,
  value,
  tone,
  prefix,
}: {
  label: string;
  value: string;
  tone: 'emerald' | 'rose';
  prefix: string;
}) {
  const klass =
    tone === 'emerald'
      ? 'text-emerald-700 dark:text-emerald-300'
      : 'text-rose-700 dark:text-rose-300';
  return (
    <div className="rounded-md bg-slate-50 px-2 py-1.5 text-center dark:bg-slate-800/50">
      <div className="text-[0.65rem] uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-bold tabular-nums ${klass}`}>
        {prefix}
        {value}
      </div>
    </div>
  );
}
