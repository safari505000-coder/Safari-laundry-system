import { type ReactElement } from 'react';
import { AgingBadge, type AgingBucket } from './AgingBadge';
import { RiskBadge, type RiskLevel } from './RiskBadge';
import { formatKwdLabel } from '@/lib/kwd';

/**
 * V20.6 — Phase 6B DebtCard.
 *
 * Hero card for a customer's canonical debt situation. Combines:
 *   • Total remaining (canonical)
 *   • Wallet balance
 *   • Aging bucket
 *   • Risk level
 *   • Counts (active / partial / overdue)
 *
 * All numbers are SERVER-CANONICAL — the card NEVER reconstitutes
 * "still owes" from primaries. Use this anywhere a customer's
 * financial state needs to be displayed.
 */

export type DebtCardProps = {
  customerName: string;
  remainingDebtKd: string;
  walletBalanceKd: string;
  agingBucket?: AgingBucket;
  oldestOverdueDays?: number;
  riskLevel?: RiskLevel;
  riskScore?: number;
  activeInvoicesCount?: number;
  partiallyPaidInvoicesCount?: number;
  overdueInvoicesCount?: number;
  locale?: 'en' | 'ar';
  className?: string;
  /** Slot for action buttons (collect, refund, escalate, etc.) */
  actions?: ReactElement;
};

export function DebtCard(props: DebtCardProps): ReactElement {
  const isAr = (props.locale ?? 'ar') === 'ar';
  const labels = isAr
    ? {
        debt: 'إجمالي المديونية',
        wallet: 'رصيد المحفظة',
        active: 'فواتير نشطة',
        partial: 'مدفوعة جزئياً',
        overdue: 'متأخرة',
      }
    : {
        debt: 'Total Outstanding',
        wallet: 'Wallet Balance',
        active: 'Active Invoices',
        partial: 'Partial Paid',
        overdue: 'Overdue',
      };
  return (
    <section
      aria-label={`Customer debt card: ${props.customerName}`}
      className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 ${
        props.className ?? ''
      }`}
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            {props.customerName}
          </h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {props.agingBucket ? (
              <AgingBadge
                bucket={props.agingBucket}
                daysOverdue={props.oldestOverdueDays}
                variant="full"
                locale={props.locale}
              />
            ) : null}
            {props.riskLevel ? (
              <RiskBadge
                level={props.riskLevel}
                score={props.riskScore}
                locale={props.locale}
              />
            ) : null}
          </div>
        </div>
        {props.actions ?? null}
      </header>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label={labels.debt} value={formatKwdLabel(props.remainingDebtKd)} accent="rose" />
        <Metric
          label={labels.wallet}
          value={formatKwdLabel(props.walletBalanceKd)}
          accent="emerald"
        />
        {props.activeInvoicesCount != null ? (
          <Metric label={labels.active} value={String(props.activeInvoicesCount)} />
        ) : null}
        {props.partiallyPaidInvoicesCount != null ? (
          <Metric label={labels.partial} value={String(props.partiallyPaidInvoicesCount)} />
        ) : null}
        {props.overdueInvoicesCount != null ? (
          <Metric label={labels.overdue} value={String(props.overdueInvoicesCount)} accent="amber" />
        ) : null}
      </div>
    </section>
  );
}

type MetricAccent = 'rose' | 'emerald' | 'amber' | 'slate';

function Metric({
  label,
  value,
  accent = 'slate',
}: {
  label: string;
  value: string;
  accent?: MetricAccent;
}) {
  const accentClass: Record<MetricAccent, string> = {
    rose: 'text-rose-700 dark:text-rose-300',
    emerald: 'text-emerald-700 dark:text-emerald-300',
    amber: 'text-amber-700 dark:text-amber-300',
    slate: 'text-slate-700 dark:text-slate-200',
  };
  return (
    <div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-0.5 text-base font-bold tabular-nums ${accentClass[accent]}`}>
        {value}
      </div>
    </div>
  );
}
