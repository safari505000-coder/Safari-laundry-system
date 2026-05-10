import { type ReactElement } from 'react';

/**
 * V20.6 — Phase 6B RiskBadge.
 *
 * Visualises a customer risk level produced by the V20.5
 * RiskScoringService. Optional `score` shows the underlying 0..100
 * raw value as a small sub-label.
 */

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

const RISK_LABEL_AR: Record<RiskLevel, string> = {
  LOW: 'منخفض',
  MEDIUM: 'متوسط',
  HIGH: 'مرتفع',
  CRITICAL: 'حرج',
};

const RISK_LABEL_EN: Record<RiskLevel, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

const RISK_CLASS: Record<RiskLevel, string> = {
  LOW: 'bg-emerald-50 text-emerald-700 ring-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800',
  MEDIUM: 'bg-yellow-50 text-yellow-800 ring-yellow-300 dark:bg-yellow-950/40 dark:text-yellow-300 dark:ring-yellow-800',
  HIGH: 'bg-orange-50 text-orange-800 ring-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:ring-orange-800',
  CRITICAL: 'bg-red-50 text-red-800 ring-red-300 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-800',
};

export type RiskBadgeProps = {
  level: RiskLevel;
  score?: number;
  locale?: 'en' | 'ar';
  className?: string;
};

export function RiskBadge({
  level,
  score,
  locale = 'ar',
  className,
}: RiskBadgeProps): ReactElement {
  const label = locale === 'ar' ? RISK_LABEL_AR[level] : RISK_LABEL_EN[level];
  return (
    <span
      role="status"
      aria-label={`Risk: ${label}${score != null ? `, score ${score}` : ''}`}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${RISK_CLASS[level]} ${
        className ?? ''
      }`}
    >
      <svg
        viewBox="0 0 12 12"
        className="h-3 w-3 fill-current opacity-70"
        aria-hidden
      >
        <circle cx="6" cy="6" r="4" />
      </svg>
      {label}
      {score != null ? (
        <span className="ml-1 text-[0.65rem] font-normal opacity-80 tabular-nums">
          {score}
        </span>
      ) : null}
    </span>
  );
}
