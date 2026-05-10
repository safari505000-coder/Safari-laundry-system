/**
 * V20.7 — Phase 4 useFinancialMutation suite.
 *
 * Locks down the mutation contract:
 *   • optimistic update is applied before the fetcher runs
 *   • cache prefix invalidates on success
 *   • optimistic update rolls back on failure
 *   • per-mutation pending / error / data state
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  financialCache,
  invalidateFinancial,
  keyOf,
} from './financial-cache';
import { useFinancialMutation } from './financial-mutation';

afterEach(() => {
  invalidateFinancial('mut-test');
});

describe('useFinancialMutation — V20.7 Phase 4', () => {
  test('applies the optimistic update synchronously, then commits on success', async () => {
    const key = keyOf(['mut-test', 'opt', '1']);
    financialCache.setQueryData<{ n: number }>(key, { n: 1 });

    const fetcher = vi.fn().mockResolvedValue({ n: 5 });

    const { result } = renderHook(() =>
      useFinancialMutation<{ n: number }, { delta: number }>(fetcher, {
        optimistic: {
          queryKey: key,
          updater: (prev, { delta }) => ({ n: (prev?.n ?? 0) + delta }),
        },
      }),
    );

    let promise: Promise<{ n: number }>;
    act(() => {
      promise = result.current.mutate({ delta: 10 });
    });
    // Optimistic value is visible immediately
    expect(financialCache.getEntry<{ n: number }>(key).data).toEqual({ n: 11 });

    await act(async () => {
      await promise!;
    });

    expect(result.current.data).toEqual({ n: 5 });
    expect(result.current.error).toBeNull();
    expect(financialCache.getEntry<{ n: number }>(key).data).toEqual({ n: 5 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test('rolls back the optimistic update on failure', async () => {
    const key = keyOf(['mut-test', 'rollback', '1']);
    financialCache.setQueryData<{ n: number }>(key, { n: 100 });

    const { result } = renderHook(() =>
      useFinancialMutation<{ n: number }, { delta: number }>(
        async () => {
          throw new Error('boom');
        },
        {
          optimistic: {
            queryKey: key,
            updater: (prev, { delta }) => ({ n: (prev?.n ?? 0) - delta }),
          },
        },
      ),
    );

    await act(async () => {
      await result.current.mutate({ delta: 25 }).catch(() => {});
    });

    expect(result.current.error?.message).toBe('boom');
    expect(financialCache.getEntry<{ n: number }>(key).data).toEqual({ n: 100 });
  });

  test('invalidates the supplied prefix after success', async () => {
    const k1 = keyOf(['mut-test', 'inv', 'a']);
    const k2 = keyOf(['mut-test', 'inv', 'b']);
    financialCache.setQueryData(k1, 1);
    financialCache.setQueryData(k2, 2);

    const { result } = renderHook(() =>
      useFinancialMutation<{ ok: true }, void>(async () => ({ ok: true }), {
        invalidatePrefix: keyOf(['mut-test', 'inv']),
      }),
    );

    await act(async () => {
      await result.current.mutate(undefined as unknown as void);
    });

    await waitFor(() => {
      expect(financialCache.getEntry(k1).fetchedAt).toBe(0);
      expect(financialCache.getEntry(k2).fetchedAt).toBe(0);
    });
  });

  test('reset() returns the hook to the initial state', async () => {
    const { result } = renderHook(() =>
      useFinancialMutation<number, void>(async () => 42),
    );
    await act(async () => {
      await result.current.mutate(undefined as unknown as void);
    });
    expect(result.current.data).toBe(42);
    act(() => result.current.reset());
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeNull();
    expect(result.current.isPending).toBe(false);
  });
});
