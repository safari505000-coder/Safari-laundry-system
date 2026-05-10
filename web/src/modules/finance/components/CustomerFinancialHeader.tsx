import { type ReactElement, type ReactNode } from 'react';
import { AgingBadge, type AgingBucket } from './AgingBadge';
import { RiskBadge, type RiskLevel } from './RiskBadge';
import { FraudBadge, type FraudSeverity } from './FraudBadge';
import { CollectionsStageBadge, type CollectionsStage } from './CollectionsStageBadge';
import { BranchBadge } from './BranchBadge';
import { formatKwdLabel } from '@/lib/kwd';

/**
 * V20.7 — Phase 3 CustomerFinancialHeader.
 *
 * Sticky header used at the top of any customer-scoped page (the
 * collections workspace, the customer 360 page, the subscriber
 * detail page). Centralises the customer identity row + signal
 * strip so every surface shows the same banner.
 *
 * All numbers are server-canonical strings; the header renders them
 * verbatim. No client-side math.
 */

export type CustomerFinancialHeaderProps = {
  customerName: string;
  customerPhone?: string | null;
  customerCode?: string | null;
  branchId?: string | null;
  branchName?: string | null;
  remainingDebtKd: string;
  walletBalanceKd: string;
  agingBucket?: AgingBucket;
  oldestOverdueDays?: number;
  riskLevel?: RiskLevel;
  riskScore?: number;
  fraudSeverity?: FraudSeverity;
  fraudOpenCount?: number;
  collectionsStage?: CollectionsStage;
  /** Slot for action buttons (collect, refund, escalate, etc.) */
  actions?: ReactNode;
  locale?: 'en' | 'ar';
  className?: string;
};

export function CustomerFinancialHeader(
  props: CustomerFinancialHeaderProps,
): ReactElement {
  const isAr = (props.locale ?? 'ar') === 'ar';
  return (
    <header
      className={`sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 ${
        props.className ?? ''
      }`}
      dir={isAr ? 'rtl' : 'ltr'}
      aria-label={`Customer financial header: ${props.customerName}`}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="truncate text-base font-bold text-slate-900 dark:text-slate-100">
            {props.customerName}
          </h2>
          {props.customerCode ? (
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.65rem] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {props.customerCode}
            </code>
          ) : null}
          {props.customerPhone ? (
            <a
              href={`tel:${props.customerPhone}`}
              className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {props.customerPhone}
            </a>
          ) : null}
          <BranchBadge
            branchId={props.branchId ?? undefined}
            branchName={props.branchName ?? undefined}
            size="xs"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
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
          {props.fraudSeverity ? (
            <FraudBadge
              severity={props.fraudSeverity}
              count={props.fraudOpenCount}
              locale={props.locale}
            />
          ) : null}
          {props.collectionsStage ? (
            <CollectionsStageBadge stage={props.collectionsStage} locale={props.locale} />
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="flex items-baseline gap-3">
          <Stat
            label={isAr ? 'مديونية' : 'Debt'}
            value={formatKwdLabel(props.remainingDebtKd)}
            tone="rose"
          />
          <Stat
            label={isAr ? 'محفظة' : 'Wallet'}
            value={formatKwdLabel(props.walletBalanceKd)}
            tone="emerald"
          />
        </div>
        {props.actions ? <div className="flex gap-1.5">{props.actions}</div> : null}
      </div>
    </header>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'rose' | 'emerald';
}) {
  const klass =
    tone === 'rose'
      ? 'text-rose-700 dark:text-rose-300'
      : 'text-emerald-700 dark:text-emerald-300';
  return (
    <div className="flex flex-col items-end">
      <span className="text-[0.65rem] uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <span className={`text-base font-bold tabular-nums ${klass}`}>{value}</span>
    </div>
  );
}
