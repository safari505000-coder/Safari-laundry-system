import { type ReactElement, useEffect, useState } from 'react';

/**
 * V20.7 — Phase 8 KeyboardShortcutHelp.
 *
 * A "?" overlay listing all keyboard shortcuts available on the
 * current screen. Activated by pressing `?` (Shift+/), dismissed
 * with Escape or any click outside the dialog.
 *
 * Designed to live at the page root so collectors can discover the
 * full Alt-letter set without leaving the workspace.
 */

export type ShortcutHelpEntry = {
  combo: string;
  description: string;
};

export type KeyboardShortcutHelpProps = {
  shortcuts: ReadonlyArray<ShortcutHelpEntry>;
  locale?: 'en' | 'ar';
  /** Override the trigger key (default `?`). */
  triggerKey?: string;
  className?: string;
};

export function KeyboardShortcutHelp(
  props: KeyboardShortcutHelpProps,
): ReactElement | null {
  const isAr = (props.locale ?? 'ar') === 'ar';
  const [open, setOpen] = useState(false);
  const triggerKey = props.triggerKey ?? '?';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore typing in form fields.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === triggerKey) {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, triggerKey]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isAr ? 'اختصارات لوحة المفاتيح' : 'Keyboard shortcuts'}
      className={`fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 ${
        props.className ?? ''
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            {isAr ? 'اختصارات لوحة المفاتيح' : 'Keyboard shortcuts'}
          </h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={isAr ? 'إغلاق' : 'Close'}
            className="rounded-md px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </header>
        <ul className="space-y-1">
          {props.shortcuts.map((s) => (
            <li
              key={s.combo}
              className="flex items-center justify-between gap-3 rounded-md px-2 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40"
            >
              <span className="text-slate-700 dark:text-slate-200">{s.description}</span>
              <kbd className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[0.65rem] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {s.combo}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
