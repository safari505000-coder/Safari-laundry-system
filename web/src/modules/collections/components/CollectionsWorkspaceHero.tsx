import { type ReactElement } from 'react';
import {
  AgingBadge,
  CollectionsStageBadge,
  DebtCard,
  FraudBadge,
  PromiseStatusBadge,
  RiskBadge,
  type AgingBucket,
  type CollectionsStage,
  type FraudSeverity,
  type PromiseStatus,
  type RiskLevel,
} from '@/modules/finance';

/**
 * V20.6 — Phase 7 Hero panel of the Collections Workspace.
 *
 * Composes the Phase 6 Financial UI Kit primitives. All numbers are
 * server-canonical (DebtCard contract). The hero is the first thing
 * a collector sees — every signal that decides "what do I do next?"
 * lives here above the fold.
 */

export type CollectionsHeroData = {
  customerName: string;
  customerPhone?: string | null;
  remainingDebtKd: string;
  walletBalanceKd: string;
  agingBucket?: AgingBucket;
  oldestOverdueDays?: number;
  riskLevel?: RiskLevel;
  riskScore?: number;
  fraudSeverity?: FraudSeverity;
  fraudOpenCount?: number;
  collectionsStage?: CollectionsStage;
  activePromise?: {
    status: PromiseStatus;
    dueDate?: string | null;
  } | null;
  activeInvoicesCount?: number;
  partiallyPaidInvoicesCount?: number;
  overdueInvoicesCount?: number;
};

export type CollectionsWorkspaceHeroProps = {
  data: CollectionsHeroData;
  onOpenFraud?: () => void;
  className?: string;
  locale?: 'en' | 'ar';
};

export function CollectionsWorkspaceHero({
  data,
  onOpenFraud,
  className,
  locale = 'ar',
}: CollectionsWorkspaceHeroProps): ReactElement {
  return (
    <section
      aria-label={`Workspace hero for ${data.customerName}`}
      className={`space-y-3 ${className ?? ''}`}
    >
      <DebtCard
        customerName={data.customerName}
        remainingDebtKd={data.remainingDebtKd}
        walletBalanceKd={data.walletBalanceKd}
        agingBucket={data.agingBucket}
        oldestOverdueDays={data.oldestOverdueDays}
        riskLevel={data.riskLevel}
        riskScore={data.riskScore}
        activeInvoicesCount={data.activeInvoicesCount}
        partiallyPaidInvoicesCount={data.partiallyPaidInvoicesCount}
        overdueInvoicesCount={data.overdueInvoicesCount}
        locale={locale}
      />

      <div
        className="flex flex-wrap items-center gap-2"
        aria-label="Customer signal strip"
      >
        {data.collectionsStage ? (
          <CollectionsStageBadge stage={data.collectionsStage} locale={locale} />
        ) : null}
        {data.agingBucket ? (
          <AgingBadge
            bucket={data.agingBucket}
            daysOverdue={data.oldestOverdueDays}
            variant="full"
            locale={locale}
          />
        ) : null}
        {data.riskLevel ? (
          <RiskBadge
            level={data.riskLevel}
            score={data.riskScore}
            locale={locale}
          />
        ) : null}
        {data.fraudSeverity ? (
          <FraudBadge
            severity={data.fraudSeverity}
            count={data.fraudOpenCount}
            onClick={onOpenFraud}
            locale={locale}
          />
        ) : null}
        {data.activePromise ? (
          <PromiseStatusBadge
            status={data.activePromise.status}
            dueDate={data.activePromise.dueDate ?? undefined}
            locale={locale}
          />
        ) : null}
        {data.customerPhone ? (
          <a
            href={`tel:${data.customerPhone}`}
            className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {data.customerPhone}
          </a>
        ) : null}
      </div>
    </section>
  );
}
