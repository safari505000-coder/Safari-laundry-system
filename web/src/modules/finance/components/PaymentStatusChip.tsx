import { type ReactElement } from 'react';

/**
 * V20.7 — Phase 3 PaymentStatusChip.
 *
 * Canonical replacement for the legacy
 * `modules/shared/components/finance/payment-status-chip.tsx` and
 * the ad-hoc badges in pages/. Reads the SERVER status string
 * verbatim (no client-side derivation).
 */

export type PaymentStatus =
  | 'PAID'
  | 'PARTIAL'
  | 'UNPAID'
  | 'REFUNDED'
  | 'CANCELLED'
  | 'PENDING';

const LABEL_AR: Record<PaymentStatus, string> = {
  PAID: 'مدفوعة',
  PARTIAL: 'مدفوعة جزئياً',
  UNPAID: 'غير مدفوعة',
  REFUNDED: 'مسترجعة',
  CANCELLED: 'ملغاة',
  PENDING: 'قيد المعالجة',
};

const LABEL_EN: Record<PaymentStatus, string> = {
  PAID: 'Paid',
  PARTIAL: 'Partially paid',
  UNPAID: 'Unpaid',
  REFUNDED: 'Refunded',
  CANCELLED: 'Cancelled',
  PENDING: 'Pending',
};

const KLASS: Record<PaymentStatus, string> = {
  PAID: 'bg-emerald-50 text-emerald-700 ring-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800',
  PARTIAL: 'bg-amber-50 text-amber-800 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800',
  UNPAID: 'bg-rose-50 text-rose-700 ring-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800',
  REFUNDED: 'bg-violet-50 text-violet-800 ring-violet-300 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800',
  CANCELLED: 'bg-slate-100 text-slate-600 ring-slate-300 line-through dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-700',
  PENDING: 'bg-blue-50 text-blue-800 ring-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800',
};

export type PaymentStatusChipProps = {
  status: PaymentStatus;
  locale?: 'en' | 'ar';
  className?: string;
};

export function PaymentStatusChip({
  status,
  locale = 'ar',
  className,
}: PaymentStatusChipProps): ReactElement {
  const label = locale === 'ar' ? LABEL_AR[status] : LABEL_EN[status];
  return (
    <span
      role="status"
      aria-label={`Payment status: ${label}`}
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${KLASS[status]} ${
        className ?? ''
      }`}
    >
      {label}
    </span>
  );
}
