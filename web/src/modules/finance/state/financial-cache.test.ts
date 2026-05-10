/**
 * V20.6 — Phase 6C cache unit suite.
 *
 * Validates the lightweight in-house cache that backs every Financial
 * UI Kit hook. The cache is the heart of Phase 6C — bugs here would
 * cascade into stale debt cards, missed invalidations, and duplicated
 * fetches on every consumer screen. Every claim made in the cache's
 * top-comment is locked down here:
 *
 *   • normalized key storage              → `setQueryData` + `getEntry`
 *   • per-key dedupe of inflight fetchers → `fetch` × 2 ⇒ 1 fetcher call
 *   • SWR semantics                       → cached read is synchronous
 *   • prefix invalidation                 → `invalidate('a')` clears 'a:1'
 *   • optimistic updates                  → updater fn sees previous data
 *   • subscriber notification             → invalidate triggers callbacks
 *   • subscriber error isolation          → throwing sub doesn't break loop
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  financialCache,
  invalidateFinancial,
  keyOf,
} from './financial-cache';

afterEach(() => {
  // Reset the singleton between tests by invalidating everything we
  // touched. We do not export a `clear()` because production code
  // should never wipe the cache wholesale.
  invalidateFinancial('test');
});

describe('FinancialCache', () => {
  test('keyOf produces a stable, deterministic key', () => {
    expect(keyOf(['finance', 'debt', 'cust_1'])).toBe('finance:debt:cust_1');
    expect(keyOf(['a', null, undefined, 0])).toBe('a:null:null:0');
  });

  test('setQueryData stores data and getEntry returns it synchronously', () => {
    const key = keyOf(['test', 'sync', '1']);
    financialCache.setQueryData(key, { v: 42 });
    const entry = financialCache.getEntry<{ v: number }>(key);
    expect(entry.data).toEqual({ v: 42 });
    expect(entry.fetchedAt).toBeGreaterThan(0);
  });

  test('setQueryData accepts an updater function with previous value', () => {
    const key = keyOf(['test', 'updater', '1']);
    financialCache.setQueryData<{ n: number }>(key, { n: 1 });
    financialCache.setQueryData<{ n: number }>(key, (prev) => ({
      n: (prev?.n ?? 0) + 10,
    }));
    expect(financialCache.getEntry<{ n: number }>(key).data).toEqual({ n: 11 });
  });

  test('fetch dedupes concurrent reads of the same key', async () => {
    const key = keyOf(['test', 'dedupe', '1']);
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    const [a, b, c] = await Promise.all([
      financialCache.fetch(key, fetcher),
      financialCache.fetch(key, fetcher),
      financialCache.fetch(key, fetcher),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(c).toEqual({ ok: true });
  });

  test('fetch failure stores error on entry and rethrows', async () => {
    const key = keyOf(['test', 'fail', '1']);
    await expect(
      financialCache.fetch(key, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const entry = financialCache.getEntry(key);
    expect(entry.error?.message).toBe('boom');
    expect(entry.data).toBeUndefined();
  });

  test('invalidate clears every key matching the prefix', () => {
    financialCache.setQueryData(keyOf(['test', 'inv', 'a']), 1);
    financialCache.setQueryData(keyOf(['test', 'inv', 'b']), 2);
    financialCache.setQueryData(keyOf(['test', 'other']), 99);
    const cleared = invalidateFinancial(keyOf(['test', 'inv']));
    expect(cleared).toBe(2);
    expect(financialCache.getEntry(keyOf(['test', 'inv', 'a'])).fetchedAt).toBe(0);
    expect(financialCache.getEntry(keyOf(['test', 'inv', 'b'])).fetchedAt).toBe(0);
    expect(financialCache.getEntry(keyOf(['test', 'other'])).fetchedAt).toBeGreaterThan(0);
  });

  test('subscribers are notified on setQueryData and invalidate', () => {
    const key = keyOf(['test', 'sub', '1']);
    const cb = vi.fn();
    const off = financialCache.subscribe(key, cb);
    financialCache.setQueryData(key, 'first');
    expect(cb).toHaveBeenCalledTimes(1);
    invalidateFinancial(keyOf(['test', 'sub']));
    expect(cb).toHaveBeenCalledTimes(2);
    off();
    financialCache.setQueryData(key, 'second');
    expect(cb).toHaveBeenCalledTimes(2);
  });

  test('a throwing subscriber does not break sibling subscribers', () => {
    const key = keyOf(['test', 'iso', '1']);
    const a = vi.fn(() => {
      throw new Error('A failed');
    });
    const b = vi.fn();
    financialCache.subscribe(key, a);
    financialCache.subscribe(key, b);
    expect(() => financialCache.setQueryData(key, 1)).not.toThrow();
    expect(b).toHaveBeenCalled();
  });
});
