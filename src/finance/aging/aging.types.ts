/**
 * V20.5 — Phase 1 Aging Engine type contract.
 *
 * Pure-data types shared between the service, the controller, and
 * the projection callers (Outstanding / Subscribers / Customer 360
 * decorators). No business logic lives here so the file is safely
 * importable from anywhere without dependency cycles.
 *
 * Banking-grade buckets:
 *   • CURRENT  — invoice age 0–30 days (within standard credit terms).
 *   • LATE     — 31–60 days (early-warning, soft-collections).
 *   • CRITICAL — 61–90 days (escalation, supervisor visibility).
 *   • LEGAL    — 90+ days (legal department / write-off review).
 *
 * The bucket order is significant — it doubles as a numeric severity
 * via {@link AGING_SEVERITY_RANK}.
 */

export type AgingBucket = 'CURRENT' | 'LATE' | 'CRITICAL' | 'LEGAL';

/**
 * Inclusive lower bound for each bucket (days). Used by
 * {@link bucketForOverdueDays} as a single source of truth.
 */
export const AGING_BUCKET_LOWER_BOUND: Record<AgingBucket, number> = {
  CURRENT: 0,
  LATE: 31,
  CRITICAL: 61,
  LEGAL: 91,
};

/**
 * Severity rank for "MAX over a portfolio" reductions:
 *   `Math.max(...invoices.map(i => AGING_SEVERITY_RANK[i.bucket]))`.
 */
export const AGING_SEVERITY_RANK: Record<AgingBucket, number> = {
  CURRENT: 0,
  LATE: 1,
  CRITICAL: 2,
  LEGAL: 3,
};

/**
 * Risk level surfaced on UI badges. One step less granular than
 * the bucket so dashboards have a stable colour mapping that
 * doesn't change every time a customer's oldest invoice ticks
 * across a day boundary.
 */
export type AgingRiskLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const RISK_FOR_BUCKET: Record<AgingBucket, AgingRiskLevel> = {
  CURRENT: 'LOW',
  LATE: 'MEDIUM',
  CRITICAL: 'HIGH',
  LEGAL: 'CRITICAL',
};

export type InvoiceAgingRow = {
  invoiceId: string;
  invoiceNumber: string | null;
  customerId: string;
  customerName: string | null;
  invoiceDateIso: string;
  remainingKd: string;
  overdueDays: number;
  agingBucket: AgingBucket;
  riskLevel: AgingRiskLevel;
};

export type CustomerAgingSummary = {
  customerId: string;
  customerName: string | null;
  totalReceivableKd: string;
  oldestInvoiceDateIso: string | null;
  oldestOverdueDays: number;
  agingBucket: AgingBucket;
  riskLevel: AgingRiskLevel;
  openInvoiceCount: number;
};

export type AgingBucketTotal = {
  bucket: AgingBucket;
  customersCount: number;
  invoicesCount: number;
  totalReceivableKd: string;
};

export type AgingReport = {
  generatedAtIso: string;
  asOfIso: string;
  totalReceivableKd: string;
  criticalReceivableKd: string;
  customersCount: number;
  invoicesCount: number;
  bucketTotals: AgingBucketTotal[];
};

/**
 * Pure function — given an "overdue days" integer, return the
 * canonical bucket. Source of truth for every other helper.
 */
export function bucketForOverdueDays(days: number): AgingBucket {
  if (!Number.isFinite(days) || days < 0) return 'CURRENT';
  if (days >= AGING_BUCKET_LOWER_BOUND.LEGAL) return 'LEGAL';
  if (days >= AGING_BUCKET_LOWER_BOUND.CRITICAL) return 'CRITICAL';
  if (days >= AGING_BUCKET_LOWER_BOUND.LATE) return 'LATE';
  return 'CURRENT';
}

/**
 * Pure function — overdue days between an invoice date and a
 * reference "as of" date (defaults to now). Floor-divided so a
 * 23-hour-old invoice still reports 0 days overdue (banking-day
 * convention).
 */
export function overdueDaysBetween(
  invoiceDate: Date,
  asOf: Date = new Date(),
): number {
  if (!(invoiceDate instanceof Date) || Number.isNaN(invoiceDate.getTime())) {
    return 0;
  }
  const ms = asOf.getTime() - invoiceDate.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}
