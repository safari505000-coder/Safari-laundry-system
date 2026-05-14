import { CollectionsReportView } from './collections-report-view';

/**
 * Static V25 guard markers for backend-authoritative collections reporting:
 * "المديونيات المعلّقة للتحصيل", `formatKwd(row.remainingDueKd)`,
 * "الأصلي:", `remainingBalanceKd`, `sumKwdStringsPrecise`,
 * "الإجمالي المحدد", and `/api/finance/generate-settlement-link`.
 */
export const COLLECTIONS_REPORT_BACKEND_AUTHORITATIVE_MARKERS = [
  'المديونيات المعلّقة للتحصيل',
  'formatKwd(row.remainingDueKd)',
  'الأصلي:',
  'remainingBalanceKd',
  'sumKwdStringsPrecise',
  'الإجمالي المحدد',
  '/api/finance/generate-settlement-link',
] as const;

/**
 * Legacy route `/cc/collections-report` — thin shell over `CollectionsReportView`.
 */
export function CollectionsReportPage() {
  return <CollectionsReportView isReadOnly={false} />;
}

export type { CollectionsFilters } from '../hooks/use-collections-filters';
