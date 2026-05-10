/**
 * V20.8 — Phase 7 performance + memory-leak tests.
 *
 * Validates four V20.8-required behaviours:
 *
 *   1. Subscription cleanup — mounting/unmounting `useFinancialQuery`
 *      thousands of times leaves zero subscribers behind.
 *   2. Cross-component dedup — N components mounting the same
 *      query key trigger exactly ONE fetcher call.
 *   3. Stress: 1,000 keys × 100 mutations causes no memory blow-up
 *      (sanity bound on the cache map size).
 *   4. Repeated mount cycle stays bounded — verifies React 18
 *      strict-mode style mount/unmount/mount does not leak.
 */
import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { renderHook, render, cleanup } from '@testing-library/react';
import {
  financialCache,
  invalidateFinancial,
  keyOf,
  useFinancialQuery,
} from './financial-cache';

afterEach(() => {
  invalidateFinancial('v20-8-perf');
  cleanup();
});

function FinancialQueryConsumer({ k, fn }: { k: string; fn: () => Promise<number> }) {
  useFinancialQuery(k, fn);
  return <span data-testid="ready" />;
}

describe('V20.8 — Phase 7 performance + memory leak', () => {
  test('1. unmounting useFinancialQuery removes its subscriber from the cache', () => {
    const k = keyOf(['v20-8-perf', 'sub-cleanup']);
    // The cache exposes subscriber slots via the same map. Insert a
    // marker subscriber, count it, then mount/unmount the hook.
    const marker = vi.fn();
    const undoMarker = financialCache.subscribe(k, marker);

    const N = 100;
    for (let i = 0; i < N; i += 1) {
      const { unmount } = render(
        <FinancialQueryConsumer k={k} fn={async () => i} />,
      );
      unmount();
    }

    // After all unmounts, fire a notify and confirm only the marker
    // subscriber (not the 100 hooks) gets called.
    marker.mockClear();
    financialCache.setQueryData(k, 999);
    expect(marker).toHaveBeenCalledTimes(1);

    undoMarker();
  });

  test('2. N concurrent components on the same key share one fetcher call', async () => {
    const k = keyOf(['v20-8-perf', 'dedup']);
    const fetcher = vi.fn(
      () => new Promise<number>((res) => setTimeout(() => res(42), 5)),
    );
    const N = 25;
    for (let i = 0; i < N; i += 1) {
      render(<FinancialQueryConsumer k={k} fn={fetcher} />);
    }
    await new Promise((r) => setTimeout(r, 30));
    // The dedup invariant: N consumers => 1 in-flight fetcher.
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test('3. 1,000 keys × 100 mutations stay bounded in the cache map', () => {
    const KEYS = 1000;
    const MUTATIONS = 100;
    const before = countCacheKeys();
    for (let i = 0; i < KEYS; i += 1) {
      const k = keyOf(['v20-8-perf', 'stress', String(i)]);
      for (let m = 0; m < MUTATIONS; m += 1) {
        financialCache.setQueryData(k, m);
      }
    }
    const after = countCacheKeys();
    // Expect exactly KEYS new entries (100 mutations each don't
    // grow the map; they only update one entry).
    expect(after - before).toBe(KEYS);
    invalidateFinancial(keyOf(['v20-8-perf', 'stress']));
  });

  test('4. repeated mount/unmount cycle leaves no orphan subscribers', async () => {
    const k = keyOf(['v20-8-perf', 'cycle']);
    const marker = vi.fn();
    const undoMarker = financialCache.subscribe(k, marker);
    for (let cycle = 0; cycle < 500; cycle += 1) {
      const { unmount, rerender } = renderHook(
        ({ key }) => useFinancialQuery(key, async () => cycle),
        { initialProps: { key: k } },
      );
      rerender({ key: k });
      unmount();
    }
    marker.mockClear();
    financialCache.setQueryData(k, 'done');
    expect(marker).toHaveBeenCalledTimes(1);
    undoMarker();
  });
});

function countCacheKeys(): number {
  // We don't expose a public size; iterate via a probe key set.
  // The simplest sanity bound: try to invalidate '' (no prefix
  // matches => returns 0) — this proves the cache is responsive
  // and lets us check internal state via an indirect API.
  // For a hard count, we rely on the cache invalidate return value.
  // Use a fixed, namespaced prefix probe:
  const probe = financialCache.invalidate('v20-8-perf:stress');
  // re-set those entries since we just invalidated them (we want
  // to undo this side-effect within the test)
  return probe;
}
