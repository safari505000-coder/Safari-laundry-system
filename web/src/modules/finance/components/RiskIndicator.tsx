import { type ReactElement } from 'react';
import { RiskBadge, type RiskLevel } from './RiskBadge';

/**
 * V20.7 — Phase 3 RiskIndicator.
 *
 * Heavier panel-style risk view. Combines the small `RiskBadge` chip
 * with a 0..100 score bar and an optional list of risk factors
 * supplied by the V20.5 RiskScoringService.
 *
 * Numbers come from the server verbatim — no client-side scoring.
 */

const TONE_BAR: Record<RiskLevel, string> = {
  LOW: 'bg-emerald-500',
  MEDIUM: 'bg-yellow-500',
  HIGH: 'bg-orange-500',
  CRITICAL: 'bg-red-600',
};

export type RiskIndicatorProps = {
  level: RiskLevel;
  score: number;
  factors?: ReadonlyArray<string>;
  locale?: 'en' | 'ar';
  className?: string;
};

export function RiskIndicator(props: RiskIndicatorProps): ReactElement {
  const isAr = (props.locale ?? 'ar') === 'ar';
  const score = Math.max(0, Math.min(100, Math.round(props.score)));
  const factors = props.factors ?? [];
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 ${
        props.className ?? ''
      }`}
      aria-label={`Risk indicator: ${props.level} ${score}`}
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {isAr ? 'مؤشر المخاطرة' : 'Risk indicator'}
        </h4>
        <RiskBadge level={props.level} score={score} locale={props.locale} />
      </header>
      <div
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
      >
        <div
          className={`h-full ${TONE_BAR[props.level]} transition-all`}
          style={{ width: `${score}%` }}
        />
      </div>
      {factors.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-[0.7rem] text-slate-600 dark:text-slate-300">
          {factors.slice(0, 5).map((f) => (
            <li key={f} className="flex items-baseline gap-1">
              <span aria-hidden className="text-slate-400">
                ·
              </span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
