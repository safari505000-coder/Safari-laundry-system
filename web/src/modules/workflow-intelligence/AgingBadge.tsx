import * as React from 'react';
import { cn } from '@/lib/utils';
import { classifyAging, type AgingClassification } from './workflow-intelligence';

/**
 * V23 Phase 6 — Aging Badge primitive.
 *
 * Compact, glanceable badge that surfaces the aging bucket of an
 * open invoice / debt row. Tone is mapped via `classifyAging`.
 *
 * Visibility-only. No money, no actions, no API calls.
 */

const TONE_CLASSES: Readonly<Record<AgingClassification['tone'], string>> = {
  info:
    'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-200',
  recommend:
    'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200',
  warn:
    'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200',
  critical:
    'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-200',
  muted:
    'border-border bg-muted/50 text-muted-foreground',
};

const BUCKET_LABEL_AR: Readonly<Record<AgingClassification['bucket'], string>> = {
  fresh: 'حديثة',
  recent: 'حديث',
  aging: 'متقدم',
  overdue: 'متأخر',
  critical: 'حرج',
};

export interface AgingBadgeProps {
  /** ISO timestamp of when the row first opened (e.g. invoice issue date). */
  openedAtIso: string;
  /** Optional `now` override for tests / SSR. */
  now?: Date | number;
  /** Hide the bucket label, render the days count only. */
  compact?: boolean;
  className?: string;
}

export const AgingBadge: React.FC<AgingBadgeProps> = ({
  openedAtIso,
  now,
  compact,
  className,
}) => {
  const c = classifyAging({ openedAtIso, now });
  return (
    <span
      data-testid="aging-badge"
      data-bucket={c.bucket}
      title={c.hint}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-medium',
        TONE_CLASSES[c.tone],
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current opacity-70" />
      {compact ? (
        <span>{c.daysOpen}ي</span>
      ) : (
        <>
          <span>{BUCKET_LABEL_AR[c.bucket]}</span>
          <span className="opacity-70">·</span>
          <span>{c.daysOpen} يوم</span>
        </>
      )}
    </span>
  );
};

AgingBadge.displayName = 'AgingBadge';
