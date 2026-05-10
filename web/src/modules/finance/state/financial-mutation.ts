import { useCallback, useState } from 'react';
import { financialCache, invalidateFinancial } from './financial-cache';

/**
 * V20.7 — Phase 4 financial mutation helper.
 *
 * Pairs with `useFinancialQuery` to round out the cache contract:
 *
 *   • Optimistic-safe updates: temporarily set cached data to the
 *     optimistic value, run the mutation, roll back on failure.
 *   • Cache invalidation by prefix after success.
 *   • Per-mutation pending / error state.
 *
 * The hook is intentionally minimal — it does not retry, dedupe,
 * or queue. Mutations are the operator's deliberate action; the
 * UI must surface the outcome explicitly.
 */

export type MutationOptions<TData, TVariables> = {
  /** Stable cache key prefix to invalidate after success. */
  invalidatePrefix?: string;
  /** Apply an optimistic update to a specific cache key before the mutation runs. */
  optimistic?: {
    queryKey: string;
    updater: (prev: TData | undefined, variables: TVariables) => TData;
  };
  /** Optional success-side callback (e.g. toast). */
  onSuccess?: (data: TData, variables: TVariables) => void;
  /** Optional error-side callback (e.g. toast). */
  onError?: (error: Error, variables: TVariables) => void;
};

export type MutationState<TData> = {
  data: TData | undefined;
  error: Error | null;
  isPending: boolean;
};

export type UseFinancialMutationResult<TData, TVariables> = MutationState<TData> & {
  mutate: (variables: TVariables) => Promise<TData>;
  reset: () => void;
};

export function useFinancialMutation<TData, TVariables>(
  fn: (variables: TVariables) => Promise<TData>,
  options: MutationOptions<TData, TVariables> = {},
): UseFinancialMutationResult<TData, TVariables> {
  const [state, setState] = useState<MutationState<TData>>({
    data: undefined,
    error: null,
    isPending: false,
  });

  const reset = useCallback(() => {
    setState({ data: undefined, error: null, isPending: false });
  }, []);

  const mutate = useCallback(
    async (variables: TVariables): Promise<TData> => {
      setState({ data: undefined, error: null, isPending: true });

      // Snapshot the prior value for rollback.
      let priorData: TData | undefined;
      if (options.optimistic) {
        const entry = financialCache.getEntry<TData>(options.optimistic.queryKey);
        priorData = entry.data;
        financialCache.setQueryData<TData>(
          options.optimistic.queryKey,
          options.optimistic.updater(entry.data, variables),
        );
      }

      try {
        const data = await fn(variables);
        setState({ data, error: null, isPending: false });
        // Commit the server-canonical response to the optimistic
        // cache key so the in-memory value matches the server.
        if (options.optimistic) {
          financialCache.setQueryData<TData>(options.optimistic.queryKey, data);
        }
        if (options.invalidatePrefix) {
          invalidateFinancial(options.invalidatePrefix);
        }
        options.onSuccess?.(data, variables);
        return data;
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        // Roll back the optimistic value.
        if (options.optimistic) {
          financialCache.setQueryData<TData | undefined>(
            options.optimistic.queryKey,
            () => priorData,
          );
        }
        setState({ data: undefined, error: errorObj, isPending: false });
        options.onError?.(errorObj, variables);
        throw errorObj;
      }
    },
    [fn, options],
  );

  return { ...state, mutate, reset };
}
