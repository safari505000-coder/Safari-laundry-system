/**
 * سياق Safari Stream — يوفر لقطة لوحة التحكم التشغيلية مع تحديث تلقائي كل 45 ثانية.
 * Safari Stream context — provides the operational dashboard snapshot with auto-refresh every 45 seconds.
 * Exposes SafariStreamProvider and the useSafariStream hook.
 */
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

/**
 * مزود سياق Safari Stream — يلف الشجرة ويوفر اللقطة والتحكم فيها.
 * SafariStreamProvider — wraps the component tree and supplies the snapshot value and refresh control.
 */
export function SafariStreamProvider({ children }: { children: ReactNode }) {
  const { token, sessionKind } = useAuth();
  const [snapshot, setSnapshot] = useState<SafariStreamSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!token || sessionKind === 'password-change') {
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
  }, [sessionKind, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!token || sessionKind === 'password-change') return;
    const id = window.setInterval(() => {
      void refresh();
    }, 45_000);
    return () => window.clearInterval(id);
  }, [sessionKind, token, refresh]);

  const value = useMemo(
    () => ({ snapshot, loading, refresh }),
    [snapshot, loading, refresh],
  );

  return (
    <SafariStreamContext.Provider value={value}>{children}</SafariStreamContext.Provider>
  );
}

/**
 * خطاف useSafariStream — يُتيح الوصول إلى لقطة Safari Stream ودالة التحديث.
 * useSafariStream hook — returns the current snapshot, loading state, and refresh function.
 * Must be used inside SafariStreamProvider.
 */
export function useSafariStream(): SafariStreamContextValue {
  const ctx = useContext(SafariStreamContext);
  if (!ctx) {
    throw new Error('useSafariStream must be used within SafariStreamProvider');
  }
  return ctx;
}
