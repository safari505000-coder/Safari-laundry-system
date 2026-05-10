import { type ReactElement } from 'react';

/**
 * V20.7 — Phase 3 BranchBadge.
 *
 * Renders a branch label with a deterministic colour seeded by the
 * branch id (so the same branch always looks the same across pages).
 */

const PALETTE = [
  'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  'bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300',
  'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
  'bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300',
  'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300',
  'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300',
];

function pickPaletteIndex(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % PALETTE.length;
}

export type BranchBadgeProps = {
  branchId?: string | null;
  branchName?: string | null;
  size?: 'xs' | 'sm';
  className?: string;
};

export function BranchBadge({
  branchId,
  branchName,
  size = 'sm',
  className,
}: BranchBadgeProps): ReactElement | null {
  if (!branchName && !branchId) return null;
  const seed = branchId ?? branchName ?? '';
  const klass = PALETTE[pickPaletteIndex(seed)];
  const sizeKlass = size === 'xs' ? 'text-[0.6rem] px-1.5 py-0' : 'text-xs px-2 py-0.5';
  return (
    <span
      aria-label={`Branch: ${branchName ?? branchId}`}
      className={`inline-flex items-center rounded-md font-medium ${sizeKlass} ${klass} ${
        className ?? ''
      }`}
    >
      {branchName ?? branchId}
    </span>
  );
}
