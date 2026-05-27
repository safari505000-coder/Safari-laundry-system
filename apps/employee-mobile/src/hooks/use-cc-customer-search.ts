import { useEffect, useMemo, useState } from 'react';
import { searchCustomers, type CustomerSearchHit } from '@/api/customers';
import { useAuth } from '@/auth/auth-context';

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function useCcCustomerSearch(rawQuery: string) {
  const { getValidAccessToken } = useAuth();
  const debounced = useDebounced(rawQuery.trim(), 300);
  const [hits, setHits] = useState<CustomerSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tooShort = debounced.length < 2;

    void (async () => {
      if (tooShort) {
        setHits([]);
        setLoading(false);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const token = await getValidAccessToken();
        if (!token) {
          throw new Error('انتهت الجلسة');
        }
        const next = await searchCustomers(token, debounced);
        if (!cancelled) {
          setHits(next);
        }
      } catch (err) {
        if (!cancelled) {
          setHits([]);
          setError(err instanceof Error ? err.message : 'فشل البحث');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debounced, getValidAccessToken]);

  return useMemo(
    () => ({
      hits,
      loading,
      error,
      queryTooShort: debounced.length < 2,
    }),
    [hits, loading, error, debounced.length],
  );
}
