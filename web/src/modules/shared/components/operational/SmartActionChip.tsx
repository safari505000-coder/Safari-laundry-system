import { type ComponentType, type ReactElement } from 'react';
import { cn } from '@/lib/utils';

/**
 * V22 Phase 5 — Smart Action Chip primitive.
 *
 * Non-destructive operational hint that suggests the next-best
 * action for an operator. Used by Customer360, Collections, and
 * the Reconciliation workspace to surface "follow-up", "callback
 * due", "promise overdue", "snapshot stale" recommendations.
 *
 * STRICT RULES (V21 + V22 hard rules):
 *   • The chip MAY suggest a workflow but MAY NOT execute it.
 *   • The chip MUST NOT compute money values, settlement amounts,
 *     or balances. Any KD value displayed must be a pre-formatted
 *     string from the canonical projection.
 *   • The chip MUST NOT call an API directly. The parent passes
 *     `onActivate` if the suggestion is actionable.
 *
 * Tones map to a fixed visual scale:
 *   info       — neutral nudge ("الاتصال بالعميل خلال 24 ساعة")
 *   recommend  — positive nudge ("جاهز للتسوية الجزئية")
 *   warn       — soft urgency ("الوعد متأخر بـ 3 أيام")
 *   critical   — hard urgency ("الفاتورة متأخرة 90+ يوم")
 *   muted      — discoverable but de-emphasized
 */
export type SmartActionTone =
  | 'info'
  | 'recommend'
  | 'warn'
  | 'critical'
  | 'muted';

export type SmartActionChipProps = {
  label: string;
  /** Optional secondary text (small, single line). */
  hint?: string;
  tone?: SmartActionTone;
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /**
   * If supplied, the chip becomes interactive (button). If omitted,
   * the chip renders as a presentational badge.
   */
  onActivate?: () => void;
  /** Optional shortcut hint (e.g. "Alt+P"). Visual only — does not bind. */
  shortcutLabel?: string;
  className?: string;
};

const TONE_CLASSES: Readonly<Record<SmartActionTone, string>> = {
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

export function SmartActionChip(props: SmartActionChipProps): ReactElement {
  const {
    label,
    hint,
    tone = 'info',
    icon: Icon,
    onActivate,
    shortcutLabel,
    className,
  } = props;

  const tonal = TONE_CLASSES[tone];
  const interactive = typeof onActivate === 'function';

  const inner = (
    <>
      {Icon ? (
        <Icon className="size-3.5 shrink-0 opacity-80" aria-hidden />
      ) : null}
      <span className="font-medium">{label}</span>
      {hint ? (
        <span className="text-[0.65rem] opacity-75 truncate max-w-[16rem]">
          {hint}
        </span>
      ) : null}
      {shortcutLabel ? (
        <kbd className="rounded border border-current/30 px-1 font-mono text-[0.6rem] opacity-70">
          {shortcutLabel}
        </kbd>
      ) : null}
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onActivate}
        data-testid="smart-action-chip"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          tonal,
          className,
        )}
      >
        {inner}
      </button>
    );
  }

  return (
    <span
      data-testid="smart-action-chip"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem]',
        tonal,
        className,
      )}
    >
      {inner}
    </span>
  );
}
