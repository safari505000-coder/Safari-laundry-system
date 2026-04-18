import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useSafariStream } from '@/contexts/safari-stream-context';
import {
  ApiError,
  getInventoryReport,
  type InventoryReportFilters,
  type InventoryReportResponse,
} from '@/lib/api';

/**
 * Shared data bridge for the Dastur §4 Smart Inventory report.
 * Consumed from `/owner/pages/InventoryReport.tsx` and
 * `/accountant/pages/InventoryReport.tsx` — Islands-safe: the hook lives in
 * /shared, each role owns its own page. Auto-reloads when the SafariStream
 * `priceListVersion` ticks (stock-in still counts as a catalog mutation for the
 * shared catalog token, so rooms picking up price reloads also see fresh stock).
 */
export function useInventoryReport(
  token: string | null,
  filters: InventoryReportFilters,
) {
  const { t } = useTranslation();
  const { snapshot } = useSafariStream();
  const [data, setData] = useState<InventoryReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const filtersKey = useMemo(
    () =>
      `${filters.categoryId ?? ''}|${filters.branchId ?? ''}|${filters.status ?? ''}`,
    [filters.categoryId, filters.branchId, filters.status],
  );

  const reload = useCallback(async () => {
    if (!token) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      const res = await getInventoryReport(token, filters);
      setData(res);
    } catch (e) {
      setData(null);
      setFailed(true);
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error(t('inventory.loadFailed'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, filtersKey, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Auto-refresh when SafariStream signals a catalog version change.
  const lastVersionRef = useRef<string | null>(null);
  useEffect(() => {
    const v = snapshot?.priceListVersion;
    if (!v) return;
    if (lastVersionRef.current === null) {
      lastVersionRef.current = v;
      return;
    }
    if (lastVersionRef.current !== v) {
      lastVersionRef.current = v;
      void reload();
    }
  }, [snapshot?.priceListVersion, reload]);

  return {
    data,
    loading,
    failed,
    reload,
  };
}
