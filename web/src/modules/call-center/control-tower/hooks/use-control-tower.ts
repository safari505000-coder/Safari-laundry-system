import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import {
  getControlTowerSnapshot,
  type ControlTowerQueryFilters,
  type ControlTowerResponse,
} from '../api/control-tower-api';

const POLL_MS = 15_000;

export type ControlTowerTransport = 'sse' | 'poll';

export type UseControlTowerState = {
  data: ControlTowerResponse | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  transport: ControlTowerTransport;
  refresh: () => void;
};

/**
 * Snapshot loader with SSE (`control-tower:update`) + 15s polling fallback.
 */
export function useControlTower(filters: ControlTowerQueryFilters): UseControlTowerState {
  const { token } = useAuth();
  const [data, setData] = useState<ControlTowerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transport, setTransport] = useState<ControlTowerTransport>('sse');
  const [refreshKey, setRefreshKey] = useState(0);

  const inFlight = useRef<AbortController | null>(null);
  /** Drops stale completions when SSE + polling + focus overlap. */
  const fetchGenerationRef = useRef(0);
  const isMounted = useRef(true);
  const filtersKey = JSON.stringify(filters);

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
      const gen = ++fetchGenerationRef.current;

      if (background) {
        setRefreshing(true);
      } else {
        setData(null);
        setLoading(true);
      }
      setError(null);
      try {
        const res = await getControlTowerSnapshot(token, filters, {
          signal: ctrl.signal,
        });
        if (
          !isMounted.current ||
          ctrl.signal.aborted ||
          gen !== fetchGenerationRef.current
        )
          return;
        setData(res);
      } catch (e) {
        if (
          !isMounted.current ||
          ctrl.signal.aborted ||
          gen !== fetchGenerationRef.current
        )
          return;
        setData(null);
        const msg =
          e instanceof ApiError
            ? e.message
            : 'تعذّر تحميل لوحة التحكم';
        setError(msg);
      } finally {
        if (
          isMounted.current &&
          !ctrl.signal.aborted &&
          gen === fetchGenerationRef.current
        ) {
          setRefreshing(false);
          setLoading(false);
        }
        if (inFlight.current === ctrl) inFlight.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filters tracked via stable filtersKey
    [token, filtersKey],
  );

  const fetchOnceRef = useRef(fetchOnce);
  fetchOnceRef.current = fetchOnce;

  useEffect(() => {
    if (!token) {
      setData(null);
      return;
    }
    void fetchOnce(false);
  }, [token, fetchOnce, refreshKey]);

  useEffect(() => {
    if (!token) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void fetchOnceRef.current(true);
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [token]);

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return;
      void fetchOnceRef.current(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void fetchOnceRef.current(true);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setTransport('sse');
      return;
    }

    let es: EventSource | null = null;
    try {
      const url = `/api/call-center/control-tower/stream?access_token=${encodeURIComponent(token)}`;
      es = new EventSource(url);
      es.onopen = () => {
        setTransport('sse');
      };
      es.addEventListener('control-tower:update', () => {
        void fetchOnceRef.current(true);
      });
      es.onerror = () => {
        es?.close();
        es = null;
        setTransport('poll');
      };
    } catch {
      setTransport('poll');
    }

    return () => {
      es?.close();
      es = null;
    };
  }, [token]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return { data, loading, refreshing, error, transport, refresh };
}
