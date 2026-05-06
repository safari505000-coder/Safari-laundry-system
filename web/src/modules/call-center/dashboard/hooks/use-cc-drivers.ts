import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { listCcDrivers, type CcDriverRow } from '../api/cc-dashboard-api';

export type UseCcDriversOptions = {
  /**
   * If true, suspend all fetching (initial + focus refetch). Used to
   * keep the network quiet while the picker is closed. The hook does
   * NOT poll on a timer — drivers churn slowly enough that
   * focus-refetch + manual reload is sufficient.
   */
  paused?: boolean;
};

export type CcDriversState = {
  drivers: CcDriverRow[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  /** Manual refresh trigger; safe to call from any UI event. */
  reload: () => void;
};

/**
 * V19.x — Authoritative driver roster for the call-center dispatch
 * dialogs. Backed by `GET /api/call-center/drivers`.
 *
 * Behavior:
 *   - Fires once on mount when a token is available.
 *   - Refetches on `window` focus (user comes back to the tab) AND on
 *     `visibilitychange` (mobile / browser tab switch). Both events
 *     are routed through the same single fetch, with an
 *     AbortController that cancels any in-flight request before the
 *     next one starts. This is the "prevent duplicate polling
 *     instances" guarantee.
 *   - Cleans up on unmount; never calls `setState` after unmount.
 *
 * No timer-based polling. The driver roster does not change quickly
 * (Owner adds drivers, not call-center agents), so timer polling
 * would add network noise without product benefit. The active-
 * dispatch hook handles fast-moving data.
 */
export function useCcDrivers(
  options: UseCcDriversOptions = {},
): CcDriversState {
  const { paused = false } = options;
  const { token } = useAuth();

  const [drivers, setDrivers] = useState<CcDriverRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const isMounted = useRef(true);
  // Tracks the AbortController for the most recent in-flight request.
  // Any new fetch (focus, visibility, manual reload) aborts the
  // previous one BEFORE issuing a new one — guarantees at most one
  // request in-flight per hook instance.
  const inFlight = useRef<AbortController | null>(null);
  const fetchGenerationRef = useRef(0);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      inFlight.current?.abort();
      inFlight.current = null;
    };
  }, []);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  const fetchOnce = useCallback(
    async (isBackground: boolean) => {
      if (!token) return;
      // Replace any in-flight request — this prevents stale completions
      // from clobbering a fresher fetch.
      inFlight.current?.abort();
      const ctrl = new AbortController();
      inFlight.current = ctrl;
      const gen = ++fetchGenerationRef.current;

      if (isBackground) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const rows = await listCcDrivers(token, { signal: ctrl.signal });
        if (
          !isMounted.current ||
          ctrl.signal.aborted ||
          gen !== fetchGenerationRef.current
        )
          return;
        setDrivers(rows);
      } catch (e) {
        if (
          !isMounted.current ||
          ctrl.signal.aborted ||
          gen !== fetchGenerationRef.current
        )
          return;
        setDrivers([]);
        const msg =
          e instanceof ApiError ? e.message : 'تعذّر تحميل قائمة السائقين';
        setError(msg);
      } finally {
        if (
          isMounted.current &&
          !ctrl.signal.aborted &&
          gen === fetchGenerationRef.current
        ) {
          if (isBackground) setRefreshing(false);
          else setLoading(false);
        }
        if (inFlight.current === ctrl) inFlight.current = null;
      }
    },
    [token],
  );

  // Initial + manual reload.
  useEffect(() => {
    if (!token || paused) return;
    void fetchOnce(false);
  }, [token, paused, fetchOnce, refreshKey]);

  // Refetch on window focus / tab visibility change. Both events are
  // wired so that closing/reopening DevTools, alt-tabbing, and
  // backgrounded mobile tabs all yield fresh data on return.
  useEffect(() => {
    if (!token || paused) return;

    const onFocus = () => {
      void fetchOnce(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void fetchOnce(true);
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [token, paused, fetchOnce]);

  return { drivers, loading, refreshing, error, reload };
}
