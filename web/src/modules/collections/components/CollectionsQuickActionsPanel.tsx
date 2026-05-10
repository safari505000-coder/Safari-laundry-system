import { type ReactElement } from 'react';

/**
 * V20.7 — Phase 5 Quick Actions panel.
 *
 * The RIGHT pane of the split-view Collections Operations Workspace.
 * Hosts:
 *   • Quick payment shortcut buttons (full / partial / promise amount)
 *   • Escalation controls
 *   • Collector personal notes
 *   • Last-action audit footer
 *
 * Designed for rapid keyboard-only operation in the busy CC bay.
 */

export type QuickShortcut = {
  id: string;
  label: string;
  hint?: string;
  shortcutLabel: string;
  tone: 'success' | 'primary' | 'warn' | 'danger' | 'ghost';
  disabled?: boolean;
  onClick: () => void;
};

const TONE_KLASS: Record<QuickShortcut['tone'], string> = {
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  warn: 'bg-amber-500 text-white hover:bg-amber-600',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  ghost: 'bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
};

export type CollectionsQuickActionsPanelProps = {
  shortcuts: ReadonlyArray<QuickShortcut>;
  lastActionLabel?: string | null;
  lastActionAt?: string | null;
  className?: string;
  locale?: 'en' | 'ar';
};

export function CollectionsQuickActionsPanel(
  props: CollectionsQuickActionsPanelProps,
): ReactElement {
  const isAr = (props.locale ?? 'ar') === 'ar';
  return (
    <aside
      role="complementary"
      aria-label={isAr ? 'إجراءات سريعة' : 'Quick actions'}
      className={`flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 ${
        props.className ?? ''
      }`}
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <header>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {isAr ? 'إجراءات سريعة' : 'Quick actions'}
        </h3>
      </header>

      <div className="flex flex-col gap-1.5">
        {props.shortcuts.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={s.disabled}
            onClick={s.onClick}
            aria-keyshortcuts={s.shortcutLabel}
            className={`group flex h-10 items-center justify-between rounded-md px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${TONE_KLASS[s.tone]}`}
          >
            <span className="flex flex-col items-start text-start leading-tight">
              <span>{s.label}</span>
              {s.hint ? (
                <span className="text-[0.6rem] font-normal opacity-80">{s.hint}</span>
              ) : null}
            </span>
            <kbd
              aria-hidden
              className="rounded bg-black/20 px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider"
            >
              {s.shortcutLabel}
            </kbd>
          </button>
        ))}
      </div>

      {props.lastActionLabel ? (
        <footer className="rounded-md bg-slate-50 px-2 py-1 text-[0.65rem] text-slate-600 dark:bg-slate-800/40 dark:text-slate-300">
          <span className="font-semibold">
            {isAr ? 'آخر إجراء: ' : 'Last action: '}
          </span>
          <span>{props.lastActionLabel}</span>
          {props.lastActionAt ? (
            <time className="ml-2 opacity-75">
              {new Date(props.lastActionAt).toLocaleString(isAr ? 'ar' : 'en')}
            </time>
          ) : null}
        </footer>
      ) : null}
    </aside>
  );
}
