import { type ReactElement } from 'react';

/**
 * V20.6 — Phase 7 CollectionsActionBar.
 *
 * Row of high-frequency collector actions. Rendered as a sticky bar
 * at the bottom of the workspace so the most common keystrokes
 * (record payment, schedule promise, escalate) are always reachable
 * regardless of scroll position.
 *
 * Buttons are LARGE (44px tap target) to support touch on the
 * Call-Center tablets. Each button advertises its keyboard shortcut
 * via a `<kbd>` chip.
 */

export type ActionItem = {
  id: string;
  label: string;
  shortcutLabel: string;
  tone: 'primary' | 'success' | 'warn' | 'danger' | 'ghost';
  disabled?: boolean;
  onClick: () => void;
};

const TONE_CLASS: Record<ActionItem['tone'], string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  warn: 'bg-amber-500 text-white hover:bg-amber-600',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  ghost: 'bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
};

export type CollectionsActionBarProps = {
  actions: ReadonlyArray<ActionItem>;
  className?: string;
  ariaLabel?: string;
};

export function CollectionsActionBar({
  actions,
  className,
  ariaLabel,
}: CollectionsActionBarProps): ReactElement {
  return (
    <div
      role="toolbar"
      aria-label={ariaLabel ?? 'Collector actions'}
      className={`flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900 ${
        className ?? ''
      }`}
    >
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          disabled={a.disabled}
          onClick={a.onClick}
          aria-keyshortcuts={a.shortcutLabel}
          className={`inline-flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${TONE_CLASS[a.tone]}`}
        >
          <span>{a.label}</span>
          <kbd
            aria-hidden
            className="rounded bg-black/20 px-1.5 py-0.5 text-[0.6rem] font-mono uppercase tracking-wider"
          >
            {a.shortcutLabel}
          </kbd>
        </button>
      ))}
    </div>
  );
}
