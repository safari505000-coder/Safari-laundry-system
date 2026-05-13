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

/**
 * شريحة عمر الدين المحاسبية — تصنيف المديونية وفق معايير بنكية
 * Banking-grade aging bucket: CURRENT (0–30d), LATE (31–60d), CRITICAL (61–90d), LEGAL (90+d).
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
/**
 * مستوى مخاطر عمر الدين — أقل تفصيلاً من الشريحة لاستقرار ألوان لوحة المعلومات
 * Aging risk level for UI badges (less granular than bucket for stable colour mapping).
 */
export type AgingRiskLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const RISK_FOR_BUCKET: Record<AgingBucket, AgingRiskLevel> = {
  CURRENT: 'LOW',
  LATE: 'MEDIUM',
  CRITICAL: 'HIGH',
  LEGAL: 'CRITICAL',
};

/**
 * صف عمر فاتورة واحدة — يتضمن الرصيد المتبقي وعدد الأيام والشريحة
 * Per-invoice aging row with remaining balance, overdue days, and bucket classification.
 */
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

/**
 * ملخص أعمار ديون العميل — أسوأ شريحة وإجمالي الحسابات المستحقة
 * Per-customer aging summary with worst bucket, total receivable, and risk level.
 */
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

/**
 * إجمالي شريحة عمر الديون — عدد العملاء والفواتير والإجمالي
 * Aggregate total for a single aging bucket across the portfolio.
 */
export type AgingBucketTotal = {
  bucket: AgingBucket;
  customersCount: number;
  invoicesCount: number;
  totalReceivableKd: string;
};

/**
 * تقرير أعمار الديون على مستوى المحفظة — إجماليات وشرائح
 * Portfolio-level aging report with global totals and per-bucket breakdown.
 */
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
 * يُحدد شريحة عمر الدين الكانونية من عدد الأيام المتأخرة
 * Pure function mapping overdue days to the canonical aging bucket.
 * Source of truth for every aging consumer.
 *
 * @param days - عدد الأيام المتأخرة | Overdue days count
 * @returns الشريحة الكانونية | Canonical aging bucket
 */
export function bucketForOverdueDays(days: number): AgingBucket {
  if (!Number.isFinite(days) || days < 0) return 'CURRENT';
  if (days >= AGING_BUCKET_LOWER_BOUND.LEGAL) return 'LEGAL';
  if (days >= AGING_BUCKET_LOWER_BOUND.CRITICAL) return 'CRITICAL';
  if (days >= AGING_BUCKET_LOWER_BOUND.LATE) return 'LATE';
  return 'CURRENT';
}

/**
 * يحسب عدد الأيام المتأخرة بين تاريخ الفاتورة وتاريخ المرجع
 * Pure function computing overdue days between invoice date and reference date.
 * Floor-divided (banking-day convention: 23h = 0 days).
 *
 * @param invoiceDate - تاريخ إصدار الفاتورة | Invoice issuance date
 * @param asOf - تاريخ الحساب (افتراضي: الآن) | Reference date (defaults to now)
 * @returns عدد الأيام المتأخرة | Overdue days count
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
