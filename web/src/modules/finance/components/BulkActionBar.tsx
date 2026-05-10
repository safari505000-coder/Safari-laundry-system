import { type ReactElement, type ReactNode } from 'react';

/**
 * V20.7 — Phase 8 BulkActionBar.
 *
 * Sticky footer bar that appears when one or more rows are
 * selected in a financial table. Hosts bulk operations (mark-as-
 * paid, escalate, export). Designed to be additive to the
 * `OutstandingTable` and similar surfaces.
 *
 * Behaviour:
 *   • Auto-hides when `selectedCount === 0`.
 *   • Mounts as a position-fixed footer to avoid layout shifts.
 *   • All actions accept disabled / loading state per button.
 */

export type BulkAction = {
  id: string;
  label: string;
  icon?: ReactNode;
  tone: 'primary' | 'success' | 'warn' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
};

const TONE_KLASS: Record<BulkAction['tone'], string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  warn: 'bg-amber-500 text-white hover:bg-amber-600',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  ghost: 'bg-slate-200 text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600',
};

export type BulkActionBarProps = {
  selectedCount: number;
  totalCount?: number;
  actions: ReadonlyArray<BulkAction>;
  onClear: () => void;
  locale?: 'en' | 'ar';
  className?: string;
};

export function BulkActionBar(props: BulkActionBarProps): ReactElement | null {
  if (props.selectedCount <= 0) return null;
  const isAr = (props.locale ?? 'ar') === 'ar';
  return (
    <div
      role="region"
      aria-label={isAr ? 'إجراءات جماعية' : 'Bulk actions'}
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-3 ${
        props.className ?? ''
      }`}
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-slate-200 bg-white/95 px-4 py-2 shadow-2xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          {isAr
            ? `${props.selectedCount} محدد${props.totalCount ? ` / ${props.totalCount}` : ''}`
            : `${props.selectedCount} selected${props.totalCount ? ` / ${props.totalCount}` : ''}`}
        </span>
        <div className="h-4 w-px bg-slate-300 dark:bg-slate-600" />
        <div className="flex items-center gap-1.5">
          {props.actions.map((a) => (
            <button
              key={a.id}
              type="button"
              disabled={a.disabled || a.loading}
              onClick={a.onClick}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${TONE_KLASS[a.tone]}`}
            >
              {a.icon ? <span aria-hidden>{a.icon}</span> : null}
              <span>{a.label}</span>
              {a.loading ? <span aria-hidden>…</span> : null}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={props.onClear}
          aria-label={isAr ? 'إلغاء التحديد' : 'Clear selection'}
          className="ml-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          {isAr ? '✕' : '✕'}
        </button>
      </div>
    </div>
  );
}
