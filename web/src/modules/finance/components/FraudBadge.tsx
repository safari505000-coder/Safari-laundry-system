import { type ReactElement } from 'react';

/**
 * V20.6 — Phase 6B FraudBadge.
 *
 * Indicates open fraud alerts on a customer. Severity drives colour;
 * `count` shows how many open alerts. Tap-target is large enough
 * for touch (44px guideline via py-1).
 */

export type FraudSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

const SEVERITY_LABEL_AR: Record<FraudSeverity, string> = {
  LOW: 'تنبيه',
  MEDIUM: 'احتيال محتمل',
  HIGH: 'احتيال مرتفع',
  CRITICAL: 'احتيال حرج',
};

const SEVERITY_CLASS: Record<FraudSeverity, string> = {
  LOW: 'bg-slate-50 text-slate-700 ring-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700',
  MEDIUM: 'bg-amber-50 text-amber-800 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800',
  HIGH: 'bg-orange-50 text-orange-800 ring-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:ring-orange-800',
  CRITICAL: 'bg-red-50 text-red-800 ring-red-300 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-800',
};

export type FraudBadgeProps = {
  severity: FraudSeverity;
  count?: number;
  locale?: 'en' | 'ar';
  className?: string;
  onClick?: () => void;
};

export function FraudBadge({
  severity,
  count,
  locale = 'ar',
  className,
  onClick,
}: FraudBadgeProps): ReactElement {
  const label = locale === 'ar' ? SEVERITY_LABEL_AR[severity] : `Fraud ${severity}`;
  const Tag: 'button' | 'span' = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-label={`Fraud alert ${severity}${count ? `, ${count} open` : ''}`}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ring-1 ${SEVERITY_CLASS[severity]} ${onClick ? 'cursor-pointer transition hover:brightness-95' : ''} ${className ?? ''}`}
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current" aria-hidden>
        <path d="M8 1l7 13H1L8 1zm0 4v5h0M8 12v.5" />
      </svg>
      {label}
      {count && count > 0 ? (
        <span className="ml-1 text-[0.65rem] font-normal opacity-80 tabular-nums">
          {count}
        </span>
      ) : null}
    </Tag>
  );
}
