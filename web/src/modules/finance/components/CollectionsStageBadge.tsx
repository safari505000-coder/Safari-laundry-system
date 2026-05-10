import { type ReactElement } from 'react';

/**
 * V20.6 — Phase 6B CollectionsStageBadge.
 *
 * Renders the V20.5 CollectionsWorkflow stage. The badge captures
 * the stage in one chip; for a richer view, compose with
 * `TimelineCard` from this kit.
 */

export type CollectionsStage =
  | 'NEW'
  | 'CONTACTED'
  | 'FOLLOW_UP'
  | 'PROMISE_TO_PAY'
  | 'ESCALATED'
  | 'LEGAL'
  | 'WRITTEN_OFF'
  | 'CLOSED';

const STAGE_LABEL_AR: Record<CollectionsStage, string> = {
  NEW: 'جديد',
  CONTACTED: 'تم التواصل',
  FOLLOW_UP: 'متابعة',
  PROMISE_TO_PAY: 'وعد بالسداد',
  ESCALATED: 'تصعيد',
  LEGAL: 'قانوني',
  WRITTEN_OFF: 'شطب',
  CLOSED: 'مغلق',
};

const STAGE_CLASS: Record<CollectionsStage, string> = {
  NEW: 'bg-slate-50 text-slate-700 ring-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700',
  CONTACTED: 'bg-sky-50 text-sky-800 ring-sky-300 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-800',
  FOLLOW_UP: 'bg-indigo-50 text-indigo-800 ring-indigo-300 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-800',
  PROMISE_TO_PAY: 'bg-emerald-50 text-emerald-800 ring-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800',
  ESCALATED: 'bg-orange-50 text-orange-800 ring-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:ring-orange-800',
  LEGAL: 'bg-purple-50 text-purple-800 ring-purple-300 dark:bg-purple-950/40 dark:text-purple-300 dark:ring-purple-800',
  WRITTEN_OFF: 'bg-gray-100 text-gray-600 ring-gray-300 line-through dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-600',
  CLOSED: 'bg-emerald-50 text-emerald-700 ring-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800',
};

export type CollectionsStageBadgeProps = {
  stage: CollectionsStage;
  locale?: 'en' | 'ar';
  className?: string;
};

export function CollectionsStageBadge({
  stage,
  locale = 'ar',
  className,
}: CollectionsStageBadgeProps): ReactElement {
  const label =
    locale === 'ar' ? STAGE_LABEL_AR[stage] : stage.replaceAll('_', ' ').toLowerCase();
  return (
    <span
      role="status"
      aria-label={`Collections stage: ${label}`}
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${STAGE_CLASS[stage]} ${
        className ?? ''
      }`}
    >
      {label}
    </span>
  );
}
