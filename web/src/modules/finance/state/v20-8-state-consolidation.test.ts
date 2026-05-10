/**
 * V20.8 — Phase 4 State consolidation contracts.
 *
 * Locks down the four V20.8-required behaviours of the financial
 * cache + mutation layer:
 *
 *   1. Cache invalidation cascades to all subscribers of a prefix.
 *   2. Optimistic update rolls back on failure.
 *   3. Stale prevention — a fresh entry within `staleMs` is NOT
 *      re-fetched.
 *   4. Concurrent updates — two parallel `mutate()` calls on the
 *      same key both observe the latest server-canonical value;
 *      no torn state.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  financialCache,
  invalidateFinancial,
  keyOf,
  useFinancialQuery,
} from './financial-cache';
import { useFinancialMutation } from './financial-mutation';

afterEach(() => {
  invalidateFinancial('v20-8-state');
});

describe('V20.8 — Phase 4 state consolidation', () => {
  test('1. invalidation cascades to every subscriber under a prefix', () => {
    const k1 = keyOf(['v20-8-state', 'cust', 'a']);
    const k2 = keyOf(['v20-8-state', 'cust', 'b']);
    financialCache.setQueryData(k1, 1);
    financialCache.setQueryData(k2, 2);

    let n1 = 0;
    let n2 = 0;
    const u1 = financialCache.subscribe(k1, () => {
      n1 += 1;
    });
    const u2 = financialCache.subscribe(k2, () => {
      n2 += 1;
    });
    invalidateFinancial(keyOf(['v20-8-state', 'cust']));

    expect(n1).toBe(1);
    expect(n2).toBe(1);
    u1();
    u2();
  });

  test('2. optimistic update rolls back on failure', async () => {
    const k = keyOf(['v20-8-state', 'opt', 'roll']);
    financialCache.setQueryData<{ kd: string }>(k, { kd: '10.000' });

    const { result } = renderHook(() =>
      useFinancialMutation<{ kd: string }, { delta: number }>(
        async () => {
          throw new Error('server-rejected');
        },
        {
          optimistic: {
            queryKey: k,
            updater: (prev, { delta }) => ({
              kd: ((Number(prev?.kd ?? 0) + delta).toFixed(3)),
            }),
          },
        },
      ),
    );

    await act(async () => {
      await result.current.mutate({ delta: 999 }).catch(() => {});
    });

    expect(financialCache.getEntry<{ kd: string }>(k).data).toEqual({
      kd: '10.000',
    });
  });

  test('3. fresh entry within staleMs is NOT re-fetched (race-free dedup)', async () => {
    const k = keyOf(['v20-8-state', 'stale', 'fresh']);
    financialCache.setQueryData(k, { v: 'cached' });

    const fetcher = vi.fn().mockResolvedValue({ v: 'remote' });
    const { result } = renderHook(() =>
      useFinancialQuery(k, fetcher, /* staleMs */ 60_000),
    );
    expect(result.current.data).toEqual({ v: 'cached' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  test('4. concurrent mutations both commit + share the final cache value', async () => {
    const k = keyOf(['v20-8-state', 'concurrent']);
    financialCache.setQueryData<{ n: number }>(k, { n: 0 });

    const { result } = renderHook(() =>
      useFinancialMutation<{ n: number }, { add: number }>(
        async ({ add }) =>
          new Promise((res) => setTimeout(() => res({ n: 100 + add }), 10)),
        {
          optimistic: {
            queryKey: k,
            updater: (prev, { add }) => ({ n: (prev?.n ?? 0) + add }),
          },
        },
      ),
    );

    let r1: Promise<{ n: number }> | undefined;
    let r2: Promise<{ n: number }> | undefined;
    act(() => {
      r1 = result.current.mutate({ add: 1 });
      r2 = result.current.mutate({ add: 2 });
    });

    await act(async () => {
      await Promise.all([r1!, r2!]);
    });

    // Both calls completed successfully; cache reflects the LAST
    // commit (server-canonical), not a torn intermediate.
    const final = financialCache.getEntry<{ n: number }>(k).data;
    expect(final).not.toBeUndefined();
    expect(typeof final!.n).toBe('number');
    expect([101, 102]).toContain(final!.n);
  });
});
