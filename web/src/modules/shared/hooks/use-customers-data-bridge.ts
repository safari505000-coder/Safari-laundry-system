import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiJson, type CustomerDirectoryRow } from '@/lib/api';

type Params = {
  token: string | null;
};

export function useCustomersDataBridge({ token }: Params) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<CustomerDirectoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(
    async (nextQuery: string) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const query = nextQuery.trim();
        const data = await apiJson<CustomerDirectoryRow[]>(
          `/api/customers${query.length >= 2 ? `?q=${encodeURIComponent(query)}` : ''}`,
          { token },
        );
        setRows(data ?? []);
      } catch (e) {
        if (e instanceof ApiError) {
          setError(e.message);
        } else {
          setError('Failed to load customers');
        }
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!token) return;
    const id = window.setTimeout(() => {
      void fetchRows(q);
    }, 300);
    return () => window.clearTimeout(id);
  }, [q, token, fetchRows]);

  const reload = useCallback(() => fetchRows(q), [fetchRows, q]);

  return {
    q,
    setQ,
    rows,
    loading,
    error,
    reload,
  };
}
