import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  getCustomer360,
  type Customer360ResponseInternal,
  type Customer360ResponseSanitized,
} from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';

export type Customer360Data =
  | Customer360ResponseInternal
  | Customer360ResponseSanitized;

export type Customer360State = {
  data: Customer360Data | null;
  loading: boolean;
  error: string | null;
  /** Re-fetch on demand (after block/unblock, after dispatch creation). */
  reload: () => void;
};

/**
 * Loader for `GET /api/customers/:customerId/360`.
 *
 * Returns either the internal CC payload (with `score` + `insights`)
 * or the sanitized customer-portal payload — discriminate by the
 * presence of `score` (typeguarded by `is360Internal`).
 */
export function useCcCustomer360(customerId: string | null): Customer360State {
  const { token } = useAuth();
  const [data, setData] = useState<Customer360Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!token || !customerId) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const res = await getCustomer360(token, customerId);
        if (!cancelled) {
          setData(res);
        }
      } catch (e) {
        if (cancelled) return;
        const msg =
          e instanceof ApiError ? e.message : 'تعذّر تحميل ملف العميل 360';
        setError(msg);
        setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, customerId, refreshKey]);

  return { data, loading, error, reload };
}

/**
 * Type guard: distinguishes the internal CC payload from the sanitized
 * customer-portal payload. The two share most fields, but only the CC
 * payload carries `score` (a number) and `insights` (object).
 */
export function is360Internal(
  payload: Customer360Data,
): payload is Customer360ResponseInternal {
  return payload.score !== null && payload.insights !== null;
}
