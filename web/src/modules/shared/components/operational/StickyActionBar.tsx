import {
  type ComponentType,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
} from 'react';
import { cn } from '@/lib/utils';

/**
 * V22 Phase 5 — Sticky Action Bar primitive.
 *
 * A compact, reusable, keyboard-first action rail meant to sit at
 * the bottom of an operational pane (Customer360, Collections,
 * Reconciliation). It renders a horizontal strip of buttons that
 * stay visible while the workspace scrolls, gives every action a
 * visible keyboard shortcut hint, and supports a `disabled` /
 * `tone` per action.
 *
 * Design notes:
 *   • PRESENTATIONAL ONLY. Owns no fetch, no money math, no
 *     mutations. Every action is a parent-supplied callback.
 *   • Each shortcut is registered as `Alt+<key>` (uppercase) so the
 *     bar plays well with the existing collector shortcut hook
 *     (`useCollectorShortcuts`) and the global command palette
 *     (Ctrl/Cmd+K).
 *   • Renders nothing visible when `actions` is empty so a workflow
 *     can hide the rail without unmounting the parent.
 *   • RTL-safe: uses logical flex spacing only.
 */
export type StickyActionBarTone =
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'ghost';

export type StickyActionBarItem = {
  id: string;
  label: string;
  /** Optional Lucide icon. */
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /**
   * Single uppercase letter; the bar wires `Alt+<key>` automatically
   * via `addEventListener` below. Pass `null` to skip the shortcut.
   */
  shortcut?: string | null;
  tone?: StickyActionBarTone;
  disabled?: boolean;
  onActivate: () => void;
};

export type StickyActionBarProps = {
  actions: ReadonlyArray<StickyActionBarItem>;
  /** Optional left-side hint (e.g. "آخر إجراء: …"). */
  hint?: ReactNode;
  /** Position: `bottom` (default) or `top`. */
  position?: 'top' | 'bottom';
  /** Hide the bar without unmounting (e.g. while a modal is open). */
  hidden?: boolean;
  className?: string;
  ariaLabel?: string;
};

const TONE_CLASSES: Readonly<Record<StickyActionBarTone, string>> = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90',
  success:
    'bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600',
  warning:
    'bg-amber-500 text-white hover:bg-amber-600 dark:bg-amber-500 dark:hover:bg-amber-600',
  danger: 'bg-destructive text-destructive-foreground hover:opacity-90',
  ghost:
    'bg-transparent text-foreground hover:bg-muted/40 border border-border',
};

export function StickyActionBar(props: StickyActionBarProps): ReactElement | null {
  const { actions, hint, position = 'bottom', hidden, className, ariaLabel } = props;

  useEffect(() => {
    if (hidden) return;
    const handler = (e: globalThis.KeyboardEvent): void => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key.toUpperCase();
      const hit = actions.find(
        (a) => !a.disabled && (a.shortcut ?? '').toUpperCase() === k,
      );
      if (!hit) return;
      e.preventDefault();
      hit.onActivate();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [actions, hidden]);

  if (hidden || actions.length === 0) return null;

  const onButtonKeyDown = (
    e: KeyboardEvent<HTMLButtonElement>,
    item: StickyActionBarItem,
  ): void => {
    if (item.disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      item.onActivate();
    }
  };

  return (
    <div
      role="toolbar"
      aria-label={ariaLabel ?? 'Operational quick actions'}
      data-testid="sticky-action-bar"
      className={cn(
        'sticky z-30 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-md backdrop-blur supports-[backdrop-filter]:bg-card/80',
        position === 'bottom' ? 'bottom-2' : 'top-2',
        className,
      )}
    >
      {hint ? (
        <div className="me-auto text-[0.7rem] text-muted-foreground">
          {hint}
        </div>
      ) : null}
      {actions.map((item) => {
        const Icon = item.icon;
        const tone = TONE_CLASSES[item.tone ?? 'primary'];
        return (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            onClick={item.disabled ? undefined : item.onActivate}
            onKeyDown={(e) => onButtonKeyDown(e, item)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              tone,
              item.disabled && 'cursor-not-allowed opacity-50',
            )}
            aria-keyshortcuts={item.shortcut ? `Alt+${item.shortcut}` : undefined}
            aria-label={item.shortcut ? `${item.label} (Alt+${item.shortcut})` : item.label}
          >
            {Icon ? <Icon className="size-4" aria-hidden /> : null}
            <span>{item.label}</span>
            {item.shortcut ? (
              <kbd className="ms-1 rounded border border-current/30 px-1 font-mono text-[0.65rem] opacity-80">
                Alt+{item.shortcut.toUpperCase()}
              </kbd>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
