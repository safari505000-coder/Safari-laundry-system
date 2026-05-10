import { useEffect, useRef, useState } from 'react';
import { tryRefreshAccessToken } from '@/lib/api';
import { invalidateFinancial } from './financial-cache';

/**
 * V20.9 — Phase 2 EventSource-backed realtime hook.
 *
 * Wraps the V20.9 backend Realtime Gateway SSE endpoint
 * (`/api/realtime/financial/:channel/stream`) and:
 *
 *   1. Connects on mount with auto-reconnect (browser-native +
 *      manual exponential backoff for hard failures).
 *   2. Decodes each `finance:event` envelope and invalidates the
 *      relevant `FinancialCache` prefixes so every subscribing
 *      `useFinancialQuery` re-fetches against the canonical API.
 *   3. NEVER applies the event payload directly to the UI — every
 *      financial value comes from a follow-up canonical fetch.
 *      This keeps the V20.5+ "no client-side financial math"
 *      invariant intact even under realtime.
 *   4. Tracks connection health (`connected` / `lastEventAt`) for
 *      the V20.9 observability surface.
 *
 * Channel routing decisions (which prefixes to invalidate per
 * event class) live HERE, not in the backend, so a future event
 * class only needs a single-file update.
 *
 * V24+ silent-refresh: when an SSE stream errors (most often because
 * the access JWT expired mid-session), the hook now first asks the
 * shared `tryRefreshAccessToken()` pipeline for a rotated access
 * token. On success the parent's `accessToken` prop changes, the
 * useEffect cleans up the dead EventSource, and a fresh connection
 * is opened with the new token — no manual backoff timer needed.
 * On failure (no handler registered, or refresh rejected by the
 * server) the hook falls back to the original exponential-backoff
 * reconnect path so a transient network blip still self-heals.
 */
export type RealtimeChannelId =
  | 'collections'
  | 'customer360'
  | 'dashboards'
  | 'fraud'
  | 'reconciliation'
  | 'risk'
  | 'branch-accounting';

export type RealtimeEnvelope = {
  channel: RealtimeChannelId;
  eventName: string;
  customerId: string | null;
  branchId: string | null;
  at: string;
  payload: unknown;
};

export type UseRealtimeFinancialFeedOptions = {
  channel: RealtimeChannelId;
  /** Optional customer scope; appended as `?customer=<id>`. */
  customerId?: string | null;
  /** Optional branch scope; appended as `?branch=<id>`. */
  branchId?: string | null;
  /** JWT for `?access_token=` (browsers can't set headers on EventSource). */
  accessToken: string | null;
  /** Mountable kill-switch. */
  enabled?: boolean;
  /** Override base URL (defaults to `/api`). */
  apiBase?: string;
  /** Optional callback fired on every event AFTER cache invalidation. */
  onEvent?: (envelope: RealtimeEnvelope) => void;
};

export type RealtimeFeedState = {
  connected: boolean;
  lastEventAt: string | null;
  reconnects: number;
  error: string | null;
};

const PREFIX_BY_EVENT: Readonly<Record<string, ReadonlyArray<string>>> = {
  'finance.invoice.issued': ['finance:customer', 'finance:invoices'],
  'finance.invoice.reversed': ['finance:customer', 'finance:invoices'],
  'finance.invoice.overdue': ['finance:customer', 'finance:collections'],
  'finance.payment.captured': ['finance:customer', 'finance:invoices', 'finance:dashboards'],
  'finance.payment.partial': ['finance:customer', 'finance:invoices'],
  'finance.wallet.absorbed': ['finance:customer', 'finance:wallet'],
  'finance.wallet.adjusted': ['finance:customer', 'finance:wallet'],
  'finance.refund.created': ['finance:customer', 'finance:refunds'],
  'finance.subscription.activated': ['finance:customer', 'finance:subscriptions'],
  'finance.subscription.expired': ['finance:customer', 'finance:subscriptions'],
  'finance.collection.escalated': ['finance:collections', 'finance:customer'],
  'finance.collection.stage.changed': ['finance:collections', 'finance:customer'],
  'finance.promise.created': ['finance:collections', 'finance:promises'],
  'finance.promise.broken': ['finance:collections', 'finance:promises'],
  'finance.promise.kept': ['finance:collections', 'finance:promises'],
  'finance.fraud.alert.created': ['finance:fraud', 'finance:customer'],
  'finance.snapshot.refreshed': ['finance:customer', 'finance:dashboards'],
  'finance.risk.recalculated': ['finance:risk', 'finance:customer'],
  'finance.reconciliation.failed': ['finance:reconciliation'],
};

/** Per-channel default fall-back when an event isn't in the map. */
const PREFIX_BY_CHANNEL: Readonly<Record<RealtimeChannelId, string>> = {
  collections: 'finance:collections',
  customer360: 'finance:customer',
  dashboards: 'finance:dashboards',
  fraud: 'finance:fraud',
  reconciliation: 'finance:reconciliation',
  risk: 'finance:risk',
  'branch-accounting': 'finance:branch',
};

export function useRealtimeFinancialFeed(
  opts: UseRealtimeFinancialFeedOptions,
): RealtimeFeedState {
  const enabled = opts.enabled ?? true;
  const [state, setState] = useState<RealtimeFeedState>({
    connected: false,
    lastEventAt: null,
    reconnects: 0,
    error: null,
  });
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!enabled || !opts.accessToken) return;

    const apiBase = opts.apiBase ?? '/api';
    const params = new URLSearchParams({ access_token: opts.accessToken });
    if (opts.customerId) params.set('customer', opts.customerId);
    if (opts.branchId) params.set('branch', opts.branchId);
    const url = `${apiBase}/realtime/financial/${opts.channel}/stream?${params.toString()}`;

    let backoffMs = 1000;
    let cancelled = false;
    let es: EventSource | null = null;

    const connect = (): void => {
      if (cancelled) return;
      try {
        es = new EventSource(url);
      } catch (err) {
        setState((s) => ({
          ...s,
          connected: false,
          error: err instanceof Error ? err.message : String(err),
        }));
        return;
      }
      es.onopen = () => {
        backoffMs = 1000;
        setState((s) => ({ ...s, connected: true, error: null }));
      };
      es.addEventListener('finance:event', (event) => {
        let envelope: RealtimeEnvelope | null = null;
        try {
          envelope = JSON.parse((event as MessageEvent).data) as RealtimeEnvelope;
        } catch {
          return;
        }
        const prefixes =
          PREFIX_BY_EVENT[envelope.eventName] ?? [
            PREFIX_BY_CHANNEL[envelope.channel] ?? 'finance',
          ];
        for (const prefix of prefixes) {
          const scoped =
            envelope.customerId != null
              ? `${prefix}:${envelope.customerId}`
              : prefix;
          invalidateFinancial(scoped);
          if (envelope.customerId != null) {
            invalidateFinancial(prefix);
          }
        }
        setState((s) => ({ ...s, lastEventAt: envelope!.at }));
        try {
          optsRef.current.onEvent?.(envelope);
        } catch {
          // Realtime callbacks must never crash the feed.
        }
      });
      es.addEventListener('heartbeat', () => {
        // Heartbeat keeps proxies happy; nothing else to do.
      });
      es.onerror = () => {
        setState((s) => ({
          ...s,
          connected: false,
          reconnects: s.reconnects + 1,
          error: 'sse-error',
        }));
        try {
          es?.close();
        } catch {
          // ignore
        }
        if (cancelled) return;

        // V24+ silent refresh.
        // EventSource never exposes the underlying HTTP status, so we
        // cannot prove this onerror was a 401. We instead opportunistically
        // ask the shared refresh pipeline (single-flight, deduped across
        // every channel) for a rotated access token. Three outcomes:
        //
        //   1. Refresh returns a NEW token → the parent's React state
        //      updates, useEffect cleanup tears this dead EventSource
        //      down, a fresh useEffect opens a new connection with the
        //      new token. We skip the manual backoff timer entirely.
        //   2. Refresh returns the SAME or stale token → drop into the
        //      exponential backoff so a transient blip still self-heals.
        //   3. No handler registered (tests / public-portal / pre-V24+
        //      hosts) → identical to (2): pure backoff path.
        void (async () => {
          let rotated: string | null = null;
          try {
            rotated = await tryRefreshAccessToken();
          } catch {
            rotated = null;
          }
          if (cancelled) return;
          if (rotated && rotated !== opts.accessToken) {
            // Parent will re-render with the new token; useEffect handles the rest.
            // Reset our local backoff so the next failure (if any) starts at 1s.
            backoffMs = 1000;
            return;
          }
          const wait = Math.min(backoffMs, 30_000);
          backoffMs = Math.min(backoffMs * 2, 30_000);
          window.setTimeout(connect, wait);
        })();
      };
    };

    connect();

    return () => {
      cancelled = true;
      try {
        es?.close();
      } catch {
        // ignore
      }
    };
  }, [
    enabled,
    opts.accessToken,
    opts.apiBase,
    opts.channel,
    opts.customerId,
    opts.branchId,
  ]);

  return state;
}
