import { useEffect, useRef } from 'react';
import { invalidateFinancial } from './financial-cache';

/**
 * V20.7 — Phase 4 WebSocket-ready realtime invalidator.
 *
 * V20.6 ships an in-process `SnapshotRealtimeRefresher` on the
 * server. To make the same near-realtime experience visible on
 * the client today (without yet wiring a WS server channel) this
 * hook polls a server-supplied "version" tag at a low frequency
 * and invalidates a cache prefix when the tag changes.
 *
 * Migration path to true WebSocket:
 *   • Swap the `pollMs` interval for a `useWebSocket` subscription.
 *   • Keep the `invalidatePrefix` contract identical — every
 *     consumer surface already invalidates correctly.
 *
 * Inputs:
 *   • `versionFetcher` — async function returning a string version
 *     tag (e.g. `customerSnapshot.refreshedAt`). MUST be cheap.
 *   • `invalidatePrefix` — cache prefix to invalidate on change.
 *   • `pollMs` — polling cadence (default 15s).
 *   • `enabled` — kill-switch (e.g. tab not focused).
 */

export type UseFinancialRealtimeOptions = {
  versionFetcher: () => Promise<string | null>;
  invalidatePrefix: string;
  pollMs?: number;
  enabled?: boolean;
};

export function useFinancialRealtime(opts: UseFinancialRealtimeOptions): void {
  const lastVersion = useRef<string | null>(null);
  const enabled = opts.enabled ?? true;
  const pollMs = opts.pollMs ?? 15000;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const v = await opts.versionFetcher();
        if (cancelled) return;
        if (v != null && v !== lastVersion.current) {
          if (lastVersion.current != null) {
            invalidateFinancial(opts.invalidatePrefix);
          }
          lastVersion.current = v;
        }
      } catch {
        // Realtime is best-effort; never throw here. The base
        // `useFinancialQuery` continues to serve stale-but-correct
        // data and a manual refetch is always available.
      }
    };

    void tick();
    const id = window.setInterval(tick, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, pollMs, opts.invalidatePrefix, opts.versionFetcher, opts]);
}
