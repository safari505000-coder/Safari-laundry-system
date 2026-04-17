import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/contexts/auth-context';
import { apiJson, ApiError, type SafariStreamSnapshot } from '@/lib/api';

type SafariStreamContextValue = {
  snapshot: SafariStreamSnapshot | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const SafariStreamContext = createContext<SafariStreamContextValue | null>(null);

export function SafariStreamProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [snapshot, setSnapshot] = useState<SafariStreamSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) {
      setSnapshot(null);
      return;
    }
    setLoading(true);
    try {
      const s = await apiJson<SafariStreamSnapshot>('/api/safari-stream/snapshot', {
        token,
      });
      setSnapshot(s);
    } catch (e) {
      if (e instanceof ApiError) {
        console.warn('SafariStream snapshot failed:', e.message);
      }
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!token) return;
    const id = window.setInterval(() => {
      void refresh();
    }, 45_000);
    return () => window.clearInterval(id);
  }, [token, refresh]);

  const value = useMemo(
    () => ({ snapshot, loading, refresh }),
    [snapshot, loading, refresh],
  );

  return (
    <SafariStreamContext.Provider value={value}>{children}</SafariStreamContext.Provider>
  );
}

export function useSafariStream(): SafariStreamContextValue {
  const ctx = useContext(SafariStreamContext);
  if (!ctx) {
    throw new Error('useSafariStream must be used within SafariStreamProvider');
  }
  return ctx;
}
