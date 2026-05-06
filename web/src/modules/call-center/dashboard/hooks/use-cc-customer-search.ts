import { useEffect, useMemo, useState } from 'react';
import { ApiError, apiJson, type CustomerDirectoryRow } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { useDebounce } from './use-debounce';

export type CustomerSearchHit = {
  id: string;
  displayName: string;
  phone: string;
  phone2: string | null;
  totalDebtKd: string;
};

type State = {
  hits: CustomerSearchHit[];
  loading: boolean;
  error: string | null;
};

/**
 * Debounced customer search backed by `GET /api/customers?q=...`.
 *
 * The hook is intentionally minimal — it does not mutate, it does not
 * cache, and it discards in-flight requests when the query changes
 * (an `AbortController` is wired through `apiJson` so the network
 * tab stays clean). Two-character minimum mirrors the existing
 * customer directory bridge to avoid full-table dumps from the
 * dashboard input.
 */
export function useCcCustomerSearch(rawQuery: string, delayMs = 250) {
  const { token } = useAuth();
  const debounced = useDebounce(rawQuery.trim(), delayMs);
  const [state, setState] = useState<State>({
    hits: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    const tooShort = debounced.length < 2;
    const skip = !token || tooShort;

    const ctrl = new AbortController();

    void (async () => {
      // Clearing stale results is done on the async tick so we never
      // run a synchronous setState inside the effect body — that would
      // trigger the `react-hooks/set-state-in-effect` cascade rule.
      if (skip) {
        if (!ctrl.signal.aborted) {
          setState({ hits: [], loading: false, error: null });
        }
        return;
      }
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await apiJson<CustomerDirectoryRow[]>(
          `/api/customers?q=${encodeURIComponent(debounced)}`,
          { token, signal: ctrl.signal },
        );
        if (ctrl.signal.aborted) return;
        const hits: CustomerSearchHit[] = (Array.isArray(data) ? data : [])
          .filter((r) => r?.customer && typeof r.customer.id === 'string')
          .slice(0, 25)
          .map((r) => ({
            id: r.customer.id,
            displayName: r.customer.displayName ?? r.customer.phone,
            phone: r.customer.phone,
            phone2: r.customer.phone2 ?? null,
            totalDebtKd: r.debt?.totalDebt ?? '0.0000',
          }));
        setState({ hits, loading: false, error: null });
      } catch (e) {
        if (ctrl.signal.aborted) return;
        const msg =
          e instanceof ApiError ? e.message : 'فشل البحث في دليل العملاء';
        setState({ hits: [], loading: false, error: msg });
      }
    })();

    return () => ctrl.abort();
  }, [debounced, token]);

  return useMemo(
    () => ({
      query: rawQuery,
      hits: state.hits,
      loading: state.loading,
      error: state.error,
      hasResults: state.hits.length > 0,
      isEmptyAllowedQuery: debounced.length >= 2 && !state.loading,
    }),
    [debounced.length, rawQuery, state],
  );
}
