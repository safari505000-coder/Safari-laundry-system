import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  deletePresenceHeartbeat,
  getCustomerCoviewers,
  postPresenceHeartbeat,
} from './presence-api';
import type { PresenceHeartbeat, PresenceScopeKind } from './types';

/**
 * V23 Phase 6 — operator presence hook.
 *
 * Continuously refreshes a heartbeat for `{scopeKind, scopeId}` while
 * the consuming component is mounted, and exposes the live list of
 * **other** operators viewing the same scope.
 *
 * Strict invariants:
 *   - Visibility-only. The hook never writes financial data, never
 *     locks records, never assumes ownership. It is a UX hint.
 *   - Self-throttling. Heartbeats every `HEARTBEAT_MS` (20s) — well
 *     below the backend's 45s stale window so a missed beat does
 *     not flap presence.
 *   - Cleanup-safe. On unmount the hook fires a best-effort
 *     `release()`. If the network is gone, the backend sweep will
 *     evict the entry on TTL expiry anyway.
 */

const HEARTBEAT_MS = 20_000;
const COVIEWERS_REFRESH_MS = 25_000;

export interface UseOperatorPresenceResult {
  coviewers: PresenceHeartbeat[];
  /** ISO timestamp of the last successful coviewers fetch. */
  lastFetchedAt: string | null;
  loading: boolean;
  error: string | null;
}

export function useOperatorPresence(args: {
  scopeKind: PresenceScopeKind;
  scopeId: string | null | undefined;
  /** Disable the hook entirely (e.g. background tab). */
  enabled?: boolean;
}): UseOperatorPresenceResult {
  const { token } = useAuth();
  const enabled = args.enabled !== false;
  const scopeId = args.scopeId ?? null;

  const [coviewers, setCoviewers] = useState<PresenceHeartbeat[]>([]);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the latest scope on a ref so the cleanup callback always
  // sees the value that was actually heartbeated, not whatever the
  // consumer happens to be on at unmount time.
  const scopeRef = useRef<{
    kind: PresenceScopeKind;
    id: string;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !token || !scopeId) {
      return;
    }
    let cancelled = false;
    scopeRef.current = { kind: args.scopeKind, id: scopeId };

    const beat = async () => {
      try {
        await postPresenceHeartbeat(token, {
          scopeKind: args.scopeKind,
          scopeId,
        });
      } catch {
        // Heartbeats are best-effort; failures degrade gracefully.
      }
    };

    const fetchPeers = async () => {
      if (args.scopeKind !== 'customer') {
        // Only the `customer` scope has a peer endpoint today.
        return;
      }
      setLoading(true);
      try {
        const res = await getCustomerCoviewers(token, scopeId);
        if (cancelled) return;
        setCoviewers(res.operators);
        setLastFetchedAt(res.computedAt);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'presence_fetch_failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void beat();
    void fetchPeers();
    const beatTimer = setInterval(beat, HEARTBEAT_MS);
    const peerTimer = setInterval(fetchPeers, COVIEWERS_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(beatTimer);
      clearInterval(peerTimer);
      const last = scopeRef.current;
      if (last && token) {
        // Best-effort release; ignore errors. Sweep TTL fallback covers crashes.
        void deletePresenceHeartbeat(token, {
          scopeKind: last.kind,
          scopeId: last.id,
        });
      }
      scopeRef.current = null;
    };
    // We deliberately depend on the *primitive* scope identifiers so a parent
    // re-render with the same scope does not tear down the heartbeat loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, token, args.scopeKind, scopeId]);

  return { coviewers, lastFetchedAt, loading, error };
}
