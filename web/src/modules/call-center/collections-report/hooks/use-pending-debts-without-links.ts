import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiJson, type OutstandingDebtWithoutLinkRow } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';

export type UsePendingDebtsWithoutLinksState = {
  rows: OutstandingDebtWithoutLinkRow[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

/**
 * V25 — read-only consumer of
 * `GET /api/finance/outstanding-debts-without-links`.
 */
export function usePendingDebtsWithoutLinks(opts?: {
  branchId?: string | null;
}): UsePendingDebtsWithoutLinksState {
  const { token } = useAuth();
  const branchId = opts?.branchId ?? null;
  const [rows, setRows] = useState<OutstandingDebtWithoutLinkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const inFlight = useRef<AbortController | null>(null);

  const fetchOnce = useCallback(async () => {
    if (!token) return;
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    setLoading(true);
    try {
      const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
      const data = await apiJson<OutstandingDebtWithoutLinkRow[]>(
        `/api/finance/outstanding-debts-without-links${qs}`,
        { token, signal: ctrl.signal },
      );
      if (ctrl.signal.aborted) return;
      setRows(Array.isArray(data) ? data : []);
      setError(null);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const msg =
        e instanceof ApiError
          ? e.message
          : 'تعذّر تحميل قائمة المديونيات التي بلا روابط دفع';
      setError(msg);
      setRows([]);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
      if (inFlight.current === ctrl) inFlight.current = null;
    }
  }, [token, branchId]);

  useEffect(() => {
    if (!token) {
      setRows([]);
      return;
    }
    void fetchOnce();
  }, [token, fetchOnce, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return {
    rows,
    loading,
    error,
    refresh,
  };
}
