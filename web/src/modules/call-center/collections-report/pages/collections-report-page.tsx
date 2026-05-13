import { CollectionsReportView } from './collections-report-view';

/**
 * Legacy route `/cc/collections-report` — thin shell over `CollectionsReportView`.
 */
export function CollectionsReportPage() {
  return <CollectionsReportView isReadOnly={false} />;
}

export type { CollectionsFilters } from '../hooks/use-collections-filters';
