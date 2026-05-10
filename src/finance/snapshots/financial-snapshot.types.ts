import type { Prisma } from '@prisma/client';

/**
 * V20.4 — Phase 1 read-side projection contract.
 *
 * `FinancialSnapshotInput` is everything {@link FinancialSnapshotService}
 * needs to upsert a single row. Fields mirror the Prisma model 1:1 so
 * the projector stays mechanical: compute the inputs from primaries,
 * hand them to the repository, never massage them again downstream.
 *
 * Increment {@link CURRENT_SCHEMA_VERSION} when the projection shape
 * changes. The cron-based reconciler force-rebuilds every row whose
 * `schemaVersion` is older than this constant.
 */
// Bumped from 1 → 2 for the V20.5 column additions (agingBucket,
// riskLevel, riskScore, collectionsStage, overdueAmountKd,
// oldestOverdueDays). The cron-based reconciler force-rebuilds
// any row whose schemaVersion is below this number so old V20.4
// rows are upgraded automatically.
export const CURRENT_SCHEMA_VERSION = 2;

export type FinancialSnapshotInput = {
  customerId: string;
  journalArBalanceKd: Prisma.Decimal;
  remainingDebtKd: Prisma.Decimal;
  paidTotalKd: Prisma.Decimal;
  totalInvoicesKd: Prisma.Decimal;
  unpaidInvoicesCount: number;
  partiallyPaidInvoicesCount: number;
  activeInvoicesCount: number;
  overdueInvoicesCount: number;
  walletBalanceKd: Prisma.Decimal;
  walletLiabilityKd: Prisma.Decimal;
  lastPaymentAt: Date | null;
  lastInvoiceAt: Date | null;
  canonicalSource: 'JOURNAL_AR' | 'PARTIAL_PAYMENT_REMAINING' | 'JOURNAL_AR_FALLBACK';
  v20_3TrueAccountingActive: boolean;
  refreshContext?: Prisma.InputJsonValue | null;
  // V20.5 — Phase 7 materialised projections of the new engines.
  // Optional so the V20.4 reconciler keeps compiling against the
  // new shape without forcing every call site to populate them
  // immediately. The repository fills in safe defaults
  // (CURRENT/LOW/0/NEW/0/0) when fields are absent.
  agingBucket?: 'CURRENT' | 'LATE' | 'CRITICAL' | 'LEGAL';
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskScore?: number;
  collectionsStage?:
    | 'NEW'
    | 'CONTACTED'
    | 'FOLLOW_UP'
    | 'PROMISE_TO_PAY'
    | 'ESCALATED'
    | 'LEGAL'
    | 'WRITTEN_OFF'
    | 'CLOSED';
  overdueAmountKd?: Prisma.Decimal;
  oldestOverdueDays?: number;
};

export type FinancialSnapshotRow = FinancialSnapshotInput & {
  id: string;
  schemaVersion: number;
  refreshedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Why a refresh fired. Echoed into `refreshContext.source` so operators
 * can grep `[FINANCIAL_SNAPSHOT_REFRESH] source=PAYMENT_CAPTURED` in
 * production logs.
 */
export type SnapshotRefreshSource =
  | 'PAYMENT_CAPTURED'
  | 'PARTIAL_PAYMENT_RECORDED'
  | 'WALLET_ABSORBED'
  | 'INVOICE_ISSUED'
  | 'COLLECTION_ESCALATED'
  | 'SUBSCRIPTION_ACTIVATED'
  | 'CRON_RECONCILE'
  | 'MANUAL_REBUILD'
  | 'BACKFILL';
