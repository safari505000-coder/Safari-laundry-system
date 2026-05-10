import * as React from 'react';
import { Activity, AlertTriangle, ShieldCheck, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  classifyQueueHealth,
  type QueueHealthInput,
  type QueueHealthLevel,
} from './workflow-intelligence';

/**
 * V23 Phase 6 — Queue Health Badge.
 *
 * Renders a single-glance status of an operational queue based on
 * `{ total, overdueCount, criticalCount }`. Visibility-only — the
 * badge informs operators where to focus, but cannot trigger any
 * mutation.
 */

const ICON_FOR_LEVEL: Readonly<
  Record<QueueHealthLevel, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>>
> = {
  healthy: ShieldCheck,
  attention: Activity,
  strained: Zap,
  breached: AlertTriangle,
};

const TONE_CLASSES = {
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
} as const;

const LEVEL_LABEL_AR: Readonly<Record<QueueHealthLevel, string>> = {
  healthy: 'سليم',
  attention: 'يحتاج اهتمام',
  strained: 'مضغوط',
  breached: 'حرج',
};

export interface QueueHealthBadgeProps extends QueueHealthInput {
  className?: string;
  ariaLabel?: string;
}

export const QueueHealthBadge: React.FC<QueueHealthBadgeProps> = (props) => {
  const c = classifyQueueHealth(props);
  const Icon = ICON_FOR_LEVEL[c.level];
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={props.ariaLabel ?? `صحة الطابور: ${LEVEL_LABEL_AR[c.level]} — ${c.hint}`}
      data-testid="queue-health-badge"
      data-level={c.level}
      className={cn(
        'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs',
        TONE_CLASSES[c.tone],
        props.className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="font-semibold">{LEVEL_LABEL_AR[c.level]}</span>
      <span className="opacity-80">·</span>
      <span>{c.hint}</span>
      <span className="rounded-full bg-white/60 px-1.5 py-0.5 text-[0.65rem] font-mono ring-1 ring-current/20">
        {c.pressurePct}٪
      </span>
    </div>
  );
};

QueueHealthBadge.displayName = 'QueueHealthBadge';
