import { type ReactElement } from 'react';

/**
 * V20.6 — Phase 6B AgingBadge.
 *
 * Visualises an Aging bucket from the V20.5 AgingService output.
 * Colour-coded; accessible (`aria-label`); responsive; dark-mode
 * ready via Tailwind utility classes the rest of the app uses.
 */

export type AgingBucket = 'CURRENT' | 'LATE' | 'CRITICAL' | 'LEGAL';

const BUCKET_LABEL: Record<AgingBucket, string> = {
  CURRENT: 'Current',
  LATE: 'Late',
  CRITICAL: 'Critical',
  LEGAL: 'Legal',
};

const BUCKET_LABEL_AR: Record<AgingBucket, string> = {
  CURRENT: 'حالي',
  LATE: 'متأخر',
  CRITICAL: 'حرج',
  LEGAL: 'قانوني',
};

const BUCKET_CLASS: Record<AgingBucket, string> = {
  CURRENT:
    'bg-emerald-50 text-emerald-700 ring-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800',
  LATE:
    'bg-amber-50 text-amber-700 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800',
  CRITICAL:
    'bg-rose-50 text-rose-700 ring-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800',
  LEGAL:
    'bg-purple-50 text-purple-800 ring-purple-300 dark:bg-purple-950/40 dark:text-purple-300 dark:ring-purple-800',
};

export type AgingBadgeProps = {
  bucket: AgingBucket;
  daysOverdue?: number;
  /** Display variant — `compact` is a single chip; `full` adds days suffix. */
  variant?: 'compact' | 'full';
  locale?: 'en' | 'ar';
  className?: string;
};

export function AgingBadge({
  bucket,
  daysOverdue,
  variant = 'compact',
  locale = 'ar',
  className,
}: AgingBadgeProps): ReactElement {
  const label = locale === 'ar' ? BUCKET_LABEL_AR[bucket] : BUCKET_LABEL[bucket];
  const showDays = variant === 'full' && daysOverdue && daysOverdue > 0;
  return (
    <span
      role="status"
      aria-label={`Aging: ${label}${showDays ? `, ${daysOverdue} days overdue` : ''}`}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${BUCKET_CLASS[bucket]} ${
        className ?? ''
      }`}
    >
      {label}
      {showDays ? (
        <span className="ml-1 text-[0.65rem] font-normal opacity-80 tabular-nums">
          {daysOverdue}d
        </span>
      ) : null}
    </span>
  );
}
