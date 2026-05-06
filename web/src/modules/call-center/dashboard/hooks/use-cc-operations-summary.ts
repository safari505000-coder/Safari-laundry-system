import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  apiJson,
  type CallCenterOperationsSummary,
} from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';

const POLL_MS = 30_000;

export type UseCcOperationsSummaryState = {
  data: CallCenterOperationsSummary | null;
  loading: boolean;
  error: string | null;
  /** Refetch on demand without flipping the loading flag. */
  refresh: () => void;
};

/**
 * Read-only consumer of `GET /api/call-center/operations-summary`.
 *
 * IMPORTANT (Command Cockpit constraint):
 *  - The hook NEVER recomputes any monetary value. It just stores the
 *    response payload as-is via `setData(response)`. Display layers
 *    must read fields like `data.debtRecoveredTodayKd` directly without
 *    summing or transforming.
 *  - Polls every 30s (background) so KPIs stay live without network
 *    spam — coarser than the unpaid-list poll on `/collections` since
 *    this is a UI-only KPI strip.
 *  - Tolerates transient errors by keeping the previously-loaded data
 *    visible (no flicker, no fake zeroes).
 */
export function useCcOperationsSummary(opts?: {
  branchId?: string | null;
  pollMs?: number;
}): UseCcOperationsSummaryState {
  const { token } = useAuth();
  const branchId = opts?.branchId ?? null;
  const pollMs = opts?.pollMs ?? POLL_MS;
  const [data, setData] = useState<CallCenterOperationsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const inFlight = useRef<AbortController | null>(null);

  const fetchOnce = useCallback(
    async (showSpinner: boolean) => {
      if (!token) return;
      inFlight.current?.abort();
      const ctrl = new AbortController();
      inFlight.current = ctrl;
      if (showSpinner) setLoading(true);
      try {
        const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
        const res = await apiJson<CallCenterOperationsSummary>(
          `/api/call-center/operations-summary${qs}`,
          { token, signal: ctrl.signal },
        );
        if (ctrl.signal.aborted) return;
        setData(res);
        setError(null);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        if (e instanceof ApiError) {
          setError(e.message);
        } else if (e instanceof Error) {
          setError(e.message);
        } else {
          setError('تعذّر تحميل ملخّص العمليات');
        }
      } finally {
        if (!ctrl.signal.aborted && showSpinner) setLoading(false);
        if (inFlight.current === ctrl) inFlight.current = null;
      }
    },
    [token, branchId],
  );

  useEffect(() => {
    if (!token) {
      setData(null);
      return;
    }
    void fetchOnce(true);
  }, [token, fetchOnce, refreshKey]);

  useEffect(() => {
    if (!token) return;
    const id = window.setInterval(() => void fetchOnce(false), pollMs);
    return () => window.clearInterval(id);
  }, [token, fetchOnce, pollMs]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return { data, loading, error, refresh };
}
