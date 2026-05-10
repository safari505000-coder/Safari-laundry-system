import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  apiJson,
  type CollectionUnpaidOnlineReportResponse,
  type CollectionUnpaidOnlineRow,
} from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';

export type UseUnpaidOnlineState = {
  rows: CollectionUnpaidOnlineRow[];
  paymentLinkRows: CollectionUnpaidOnlineRow[];
  branchSummaries: CollectionUnpaidOnlineReportResponse['branchSummaries'];
  paymentLinkSummary: CollectionUnpaidOnlineReportResponse['paymentLinkSummary'];
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

/**
 * Read-only consumer of `GET /api/orders/collections/unpaid-online`.
 *
 * The Collections Report uses this for the per-branch summary and the
 * payment-link tracker. The endpoint already powers the legacy
 * `collections-page` so behaviour, RBAC and field shape are identical
 * — no new APIs introduced.
 */
export function useUnpaidOnline(opts?: {
  branchId?: string | null;
}): UseUnpaidOnlineState {
  const { token } = useAuth();
  const branchId = opts?.branchId ?? null;
  const [rows, setRows] = useState<CollectionUnpaidOnlineRow[]>([]);
  const [paymentLinkRows, setPaymentLinkRows] = useState<CollectionUnpaidOnlineRow[]>([]);
  const [branchSummaries, setBranchSummaries] = useState<
    CollectionUnpaidOnlineReportResponse['branchSummaries']
  >([]);
  const [paymentLinkSummary, setPaymentLinkSummary] = useState<
    CollectionUnpaidOnlineReportResponse['paymentLinkSummary']
  >({ totalRows: 0, actionableRows: 0 });
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
      const qs = branchId
        ? `?branchId=${encodeURIComponent(branchId)}`
        : '';
      const data = await apiJson<CollectionUnpaidOnlineReportResponse>(
        `/api/orders/collections/unpaid-online/report${qs}`,
        { token, signal: ctrl.signal },
      );
      if (ctrl.signal.aborted) return;
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setPaymentLinkRows(Array.isArray(data.paymentLinkRows) ? data.paymentLinkRows : []);
      setBranchSummaries(Array.isArray(data.branchSummaries) ? data.branchSummaries : []);
      setPaymentLinkSummary(
        data.paymentLinkSummary ?? { totalRows: 0, actionableRows: 0 },
      );
      setError(null);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const msg =
        e instanceof ApiError
          ? e.message
          : 'تعذّر تحميل قائمة روابط الدفع غير المدفوعة';
      setError(msg);
      setRows([]);
      setPaymentLinkRows([]);
      setBranchSummaries([]);
      setPaymentLinkSummary({ totalRows: 0, actionableRows: 0 });
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
    paymentLinkRows,
    branchSummaries,
    paymentLinkSummary,
    loading,
    error,
    refresh,
  };
}
