import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import {
  listOutstanding,
  type OutstandingFilters,
  type OutstandingResponse,
} from '../api/outstanding-api';

export type UseOutstandingState = {
  data: OutstandingResponse | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => void;
};

/**
 * V19.x — Wraps `GET /api/finance/outstanding`. Stable behaviour:
 *  - One in-flight request at a time (AbortController on the ref).
 *  - Initial load on mount + on `filters` change.
 *  - Manual refresh keeps prior `data` visible (background refresh).
 *  - Listens to `window.focus` so call-centre agents see fresh totals
 *    when they tab back in from WhatsApp.
 */
export function useOutstanding(
  filters: OutstandingFilters,
): UseOutstandingState {
  const { token } = useAuth();
  const [data, setData] = useState<OutstandingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const inFlight = useRef<AbortController | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      inFlight.current?.abort();
      inFlight.current = null;
    };
  }, []);

  const fetchOnce = useCallback(
    async (background: boolean) => {
      if (!token) return;
      inFlight.current?.abort();
      const ctrl = new AbortController();
      inFlight.current = ctrl;

      if (background && data) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await listOutstanding(token, filters, {
          signal: ctrl.signal,
        });
        if (!isMounted.current || ctrl.signal.aborted) return;
        setData(res);
      } catch (e) {
        if (!isMounted.current || ctrl.signal.aborted) return;
        const msg =
          e instanceof ApiError
            ? e.message
            : 'تعذّر تحميل قائمة الذمم المدينة';
        setError(msg);
      } finally {
        if (isMounted.current && !ctrl.signal.aborted) {
          setRefreshing(false);
          setLoading(false);
        }
        if (inFlight.current === ctrl) inFlight.current = null;
      }
    },
    // We deliberately serialise the filters into a string so the
    // effect deps stay stable across object-identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, JSON.stringify(filters)],
  );

  useEffect(() => {
    if (!token) {
      setData(null);
      return;
    }
    void fetchOnce(false);
  }, [token, fetchOnce, refreshKey]);

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return;
      void fetchOnce(true);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchOnce]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return { data, loading, refreshing, error, refresh };
}
