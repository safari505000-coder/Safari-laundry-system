import { type ReactElement } from 'react';

/**
 * V20.6 — Phase 6B PromiseStatusBadge.
 *
 * Renders a Promise-To-Pay status from the V20.5 PromisesToPay
 * service. Optional `dueDate` shows a countdown for ACTIVE promises.
 */

export type PromiseStatus = 'ACTIVE' | 'KEPT' | 'BROKEN' | 'CANCELLED';

const STATUS_LABEL_AR: Record<PromiseStatus, string> = {
  ACTIVE: 'وعد فعّال',
  KEPT: 'وعد مُنفّذ',
  BROKEN: 'وعد مُخالف',
  CANCELLED: 'ملغى',
};

const STATUS_CLASS: Record<PromiseStatus, string> = {
  ACTIVE: 'bg-blue-50 text-blue-800 ring-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800',
  KEPT: 'bg-emerald-50 text-emerald-800 ring-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800',
  BROKEN: 'bg-rose-50 text-rose-800 ring-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800',
  CANCELLED: 'bg-slate-50 text-slate-600 ring-slate-300 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-700',
};

export type PromiseStatusBadgeProps = {
  status: PromiseStatus;
  dueDate?: string | null;
  locale?: 'en' | 'ar';
  className?: string;
};

export function PromiseStatusBadge({
  status,
  dueDate,
  locale = 'ar',
  className,
}: PromiseStatusBadgeProps): ReactElement {
  const label = locale === 'ar' ? STATUS_LABEL_AR[status] : status.toLowerCase();
  let countdown: string | null = null;
  if (status === 'ACTIVE' && dueDate) {
    const dueMs = new Date(dueDate).getTime();
    if (Number.isFinite(dueMs)) {
      const days = Math.round((dueMs - Date.now()) / (24 * 60 * 60 * 1000));
      countdown = days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`;
    }
  }
  return (
    <span
      role="status"
      aria-label={`Promise: ${label}${countdown ? `, ${countdown}` : ''}`}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${STATUS_CLASS[status]} ${
        className ?? ''
      }`}
    >
      {label}
      {countdown ? (
        <span className="ml-1 text-[0.65rem] font-normal opacity-80 tabular-nums">
          {countdown}
        </span>
      ) : null}
    </span>
  );
}
