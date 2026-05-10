import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * V20.6 — Phase 6C lightweight financial cache.
 *
 * Mimics the public surface of TanStack Query (queryKey, fetcher,
 * invalidate, optimistic updates) without pulling in the dependency.
 * Two reasons to keep it in-house for V20.6:
 *
 *   1. Zero added bundle bytes — TanStack Query is great but adding
 *      it now requires wiring the QueryClientProvider at every test
 *      mount + storybook + e2e harness. Out-of-scope for V20.6.
 *   2. The Financial UI Kit hooks need a normalised cache that
 *      key-collapses by `customerId` so a debt update from any
 *      surface invalidates every consumer (DebtCard / Aging / Risk
 *      / Timeline / etc.) atomically. Building it ourselves keeps
 *      the invalidation semantics simple + predictable.
 *
 * When the team is ready to migrate to TanStack Query, swap
 * `useFinancialQuery` for `useQuery` 1-for-1 — the call signatures
 * line up.
 *
 * Cache semantics:
 *   • Normalized by stable string queryKey (use `keyOf(parts)`).
 *   • Per-key SWR: when a stale read is requested, returns cached
 *     data immediately AND triggers a background refetch.
 *   • Per-key dedupe: concurrent reads of the same key share one
 *     in-flight fetcher promise.
 *   • Optimistic updates: `setQueryData(key, updater)` mutates
 *     cache + notifies subscribers synchronously.
 *   • Selective invalidation: `invalidate(prefix)` invalidates any
 *     key starting with the given prefix.
 */

type CacheEntry<T> = {
  data: T | undefined;
  error: Error | null;
  fetchedAt: number;
  inflight: Promise<T> | null;
};

type Subscriber = () => void;

class FinancialCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly subs = new Map<string, Set<Subscriber>>();

  getEntry<T>(key: string): CacheEntry<T> {
    const e = this.store.get(key) as CacheEntry<T> | undefined;
    if (e) return e;
    const fresh: CacheEntry<T> = {
      data: undefined,
      error: null,
      fetchedAt: 0,
      inflight: null,
    };
    this.store.set(key, fresh);
    return fresh;
  }

  setQueryData<T>(
    key: string,
    updater: T | ((prev: T | undefined) => T),
  ): void {
    const e = this.getEntry<T>(key);
    e.data =
      typeof updater === 'function'
        ? (updater as (p: T | undefined) => T)(e.data)
        : updater;
    e.error = null;
    e.fetchedAt = Date.now();
    this.notify(key);
  }

  invalidate(prefix: string): number {
    let n = 0;
    for (const key of this.store.keys()) {
      if (key === prefix || key.startsWith(`${prefix}:`)) {
        const e = this.store.get(key)!;
        e.fetchedAt = 0;
        this.notify(key);
        n += 1;
      }
    }
    return n;
  }

  subscribe(key: string, sub: Subscriber): () => void {
    let set = this.subs.get(key);
    if (!set) {
      set = new Set();
      this.subs.set(key, set);
    }
    set.add(sub);
    return () => {
      set?.delete(sub);
    };
  }

  private notify(key: string): void {
    const set = this.subs.get(key);
    if (!set) return;
    for (const s of set) {
      try {
        s();
      } catch {
        // swallow — never break the cache loop on a subscriber error
      }
    }
  }

  /** Ensures one in-flight fetcher per key (request dedupe). */
  fetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const e = this.getEntry<T>(key);
    if (e.inflight) return e.inflight;
    e.inflight = fetcher()
      .then((data) => {
        e.data = data;
        e.error = null;
        e.fetchedAt = Date.now();
        this.notify(key);
        return data;
      })
      .catch((err: unknown) => {
        const errObj = err instanceof Error ? err : new Error(String(err));
        e.error = errObj;
        this.notify(key);
        throw errObj;
      })
      .finally(() => {
        e.inflight = null;
      });
    return e.inflight;
  }
}

export const financialCache = new FinancialCache();

/** Build a stable string key from an array of parts. */
export function keyOf(parts: ReadonlyArray<string | number | null | undefined>): string {
  return parts
    .map((p) => (p == null ? 'null' : String(p)))
    .join(':');
}

export type UseFinancialQueryResult<T> = {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  isStale: boolean;
  refetch: () => Promise<T | undefined>;
};

/**
 * React hook bound to the financial cache. Returns `data` synchronously
 * if cached; triggers a fetch on cold start or when stale. Subscribes
 * to cache notifications so an `invalidate` from another surface
 * automatically refreshes this hook's consumer.
 *
 * @param queryKey  Stable string identifying this query.
 * @param fetcher   Async loader, called on cold start / refetch.
 * @param staleMs   Treat data older than this as stale (default 30s).
 */
export function useFinancialQuery<T>(
  queryKey: string,
  fetcher: () => Promise<T>,
  staleMs = 30000,
): UseFinancialQueryResult<T> {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Subscribe to the cache so this hook re-renders on notify().
  const subscribe = (cb: () => void) => financialCache.subscribe(queryKey, cb);
  const getSnapshot = () => financialCache.getEntry<T>(queryKey);
  const entry = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const [loading, setLoading] = useState(false);

  const isStale = entry.fetchedAt === 0 || Date.now() - entry.fetchedAt > staleMs;

  useEffect(() => {
    if (!isStale) return;
    setLoading(true);
    financialCache
      .fetch(queryKey, () => fetcherRef.current())
      .catch(() => {
        // error already captured in cache entry
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, isStale]);

  const refetch = async (): Promise<T | undefined> => {
    setLoading(true);
    try {
      return await financialCache.fetch(queryKey, () => fetcherRef.current());
    } catch {
      return undefined;
    } finally {
      setLoading(false);
    }
  };

  return {
    data: entry.data,
    error: entry.error,
    loading,
    isStale,
    refetch,
  };
}

/** Cache invalidation helper — call after a mutation. */
export function invalidateFinancial(prefix: string): number {
  return financialCache.invalidate(prefix);
}
