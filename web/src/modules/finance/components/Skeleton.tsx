import { type ReactElement } from 'react';

/**
 * V20.7 — Phase 3 / 8 financial loading skeletons.
 *
 * Pre-shaped placeholders that match the dimensions of the
 * Financial UI Kit primitives so a screen never collapses-then-jumps
 * during loading.
 */

export function SkeletonLine({
  width = '100%',
  height = 12,
  className,
}: {
  width?: string | number;
  height?: number;
  className?: string;
}): ReactElement {
  return (
    <span
      aria-hidden
      className={`block animate-pulse rounded bg-slate-200 dark:bg-slate-700 ${className ?? ''}`}
      style={{ width, height }}
    />
  );
}

export function SkeletonCircle({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}): ReactElement {
  return (
    <span
      aria-hidden
      className={`block animate-pulse rounded-full bg-slate-200 dark:bg-slate-700 ${className ?? ''}`}
      style={{ width: size, height: size }}
    />
  );
}

export function SkeletonDebtCard(): ReactElement {
  return (
    <div
      role="status"
      aria-label="Loading debt card"
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
    >
      <SkeletonLine width="60%" height={16} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SkeletonLine width="80%" height={20} />
        <SkeletonLine width="80%" height={20} />
        <SkeletonLine width="50%" height={20} />
        <SkeletonLine width="50%" height={20} />
      </div>
    </div>
  );
}

export function SkeletonRow(): ReactElement {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <SkeletonCircle size={28} />
      <div className="flex-1 space-y-1.5">
        <SkeletonLine width="40%" />
        <SkeletonLine width="80%" height={10} />
      </div>
      <SkeletonLine width={80} height={14} />
    </div>
  );
}

export function SkeletonTable({
  rows = 8,
  className,
}: {
  rows?: number;
  className?: string;
}): ReactElement {
  return (
    <div
      role="status"
      aria-label="Loading rows"
      className={`overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 ${
        className ?? ''
      }`}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
