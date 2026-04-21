import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * V19.9.5 — Shared filter-bar primitive.
 *
 * A horizontal container for page-level filters (date range, select,
 * search box) with an optional right-aligned action slot for the
 * primary CTA or refresh button. On mobile the bar wraps vertically;
 * on tablet+ it flows inline with consistent gap and border.
 *
 * Each direct child of `children` becomes one filter cell. Wrap each
 * control in a <label> or <div> to get the standard caption+control
 * rhythm, or use the exported `FilterField` helper.
 */
type FilterBarProps = {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function FilterBar({ children, actions, className }: FilterBarProps) {
  return (
    <div
      className={cn(
        'mb-4 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-end sm:gap-4',
        className,
      )}
    >
      <div className="flex flex-1 flex-wrap items-end gap-3 sm:gap-4">
        {children}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

type FilterFieldProps = {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  /** Render a 1-line helper text below the control. */
  hint?: ReactNode;
};

export function FilterField({
  label,
  children,
  className,
  hint,
}: FilterFieldProps) {
  return (
    <div className={cn('flex min-w-[9rem] flex-col gap-1', className)}>
      <label className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {hint ? (
        <p className="text-[11px] text-muted-foreground/80">{hint}</p>
      ) : null}
    </div>
  );
}
