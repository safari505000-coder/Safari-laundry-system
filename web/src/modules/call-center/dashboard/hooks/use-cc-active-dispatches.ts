import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import {
  listActiveDispatches,
  type DispatchSnapshot,
  type DispatchRow,
} from '../api/cc-dashboard-api';

const DEFAULT_POLL_MS = 10_000;

export type UseActiveDispatchesOptions = {
  /** Poll interval in ms. Set to `0` to fetch once on mount only. */
  pollMs?: number;
  /** Filter the snapshot to only rows matching this customer. */
  customerId?: string | null;
  /**
   * Pause polling AND focus-refetch (e.g. tab is hidden, modal is
   * open). When this flips back to false the next visible tick will
   * resume the cadence; we deliberately do not force-fire on the
   * unpause edge to keep the network footprint flat.
   */
  paused?: boolean;
};

export type ActiveDispatchesState = {
  snapshot: DispatchSnapshot | null;
  rows: DispatchRow[];
  loading: boolean;
  /** Background refresh in progress (rows preserved). */
  refreshing: boolean;
  error: string | null;
  reload: () => void;
};

/**
 * V19.x — Polls `GET /api/call-center/dispatch/active` on a fixed
 * cadence and exposes the snapshot + customer-filtered rows. Used by
 * the call-center dashboard's Dispatch tab and the customer-360
 * Dispatch tab.
 *
 * Behavior:
 *   - Polls every `pollMs` (default 10s) while `paused === false`
 *     AND the document is visible. Hidden tabs and dialogs that pass
 *     `paused: true` skip ticks entirely — no network calls, no CPU
 *     wasted on background renders.
 *   - Refetches on `window.focus` (the operator switched back to the
 *     browser) and on `visibilitychange → visible` (mobile / tab
 *     switch). Both paths route through the same single fetch with
 *     a hook-scoped AbortController, so repeated focus events only
 *     ever leave AT MOST ONE request in-flight per hook instance.
 *   - On unmount the in-flight request is aborted and listeners
 *     removed; no setState after unmount.
 *
 * Driver picker note: this hook USED to derive a `driversInPlay`
 * list from the snapshot. That was a stop-gap and has been removed.
 * Use `useCcDrivers()` (backed by `GET /api/call-center/drivers`) as
 * the authoritative roster — it includes drivers with no current
 * dispatches, which the snapshot-derived list could never see.
 */
export function useCcActiveDispatches(
  options: UseActiveDispatchesOptions = {},
): ActiveDispatchesState {
  const { pollMs = DEFAULT_POLL_MS, customerId = null, paused = false } =
    options;
  const { token } = useAuth();

  const [snapshot, setSnapshot] = useState<DispatchSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const isMounted = useRef(true);
  // Tracks the AbortController for the most recent in-flight request.
  // Any new fetch (poll tick, focus event, visibility event, manual
  // reload) aborts the previous one before issuing a new one. This is
  // the "prevent duplicate polling instances" guarantee — even with
  // multiple concurrent triggers we never have two requests racing.
  const inFlight = useRef<AbortController | null>(null);
  /** Drops completions from superseded polls/focus bursts so stale payloads never replace fresh ones. */
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

  const fetchSnapshot = useCallback(
    async (isBackground: boolean) => {
      if (!token) return;
      inFlight.current?.abort();
      const ctrl = new AbortController();
      inFlight.current = ctrl;
      const gen = ++fetchGenerationRef.current;

      if (isBackground) setRefreshing(true);
      else {
        setSnapshot(null);
        setLoading(true);
      }
      setError(null);
      try {
        const res = await listActiveDispatches(token, { signal: ctrl.signal });
        if (
          !isMounted.current ||
          ctrl.signal.aborted ||
          gen !== fetchGenerationRef.current
        )
          return;
        setSnapshot(res);
      } catch (e) {
        if (
          !isMounted.current ||
          ctrl.signal.aborted ||
          gen !== fetchGenerationRef.current
        )
          return;
        setSnapshot(null);
        const msg =
          e instanceof ApiError ? e.message : 'تعذّر تحميل المهمات النشطة';
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

  // Initial fetch + manual reload trigger.
  useEffect(() => {
    if (!token) {
      setSnapshot(null);
      return;
    }
    void fetchSnapshot(false);
  }, [token, fetchSnapshot, refreshKey]);

  // Polling loop with visibility + paused awareness.
  useEffect(() => {
    if (!token || pollMs <= 0 || paused) return;

    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      void fetchSnapshot(true);
    };
    const timer = window.setInterval(tick, pollMs);

    const onFocus = () => {
      // Focus is a strong "user is looking at this" signal — refetch
      // immediately on top of whatever the next interval tick will do.
      void fetchSnapshot(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void fetchSnapshot(true);
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [token, pollMs, paused, fetchSnapshot]);

  const filteredRows = useMemo<DispatchRow[]>(() => {
    if (!snapshot) return [];
    if (!customerId) return snapshot.rows;
    return snapshot.rows.filter((r) => r.customerId === customerId);
  }, [snapshot, customerId]);

  return {
    snapshot,
    rows: filteredRows,
    loading,
    refreshing,
    error,
    reload,
  };
}
