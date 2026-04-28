/**
 * Connectivity + queued mutation count + manual / automatic FIFO sync.
 * Phase 1: infra + UX; callers enqueue when offline via {@link enqueuePendingMutation}.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import {
  enqueuePendingMutation,
  countPendingMutations,
} from '@/offline/queue-ops';
import { fetchAndStorePosCustomerDirectory } from '@/offline/customer-cache';
import { prefetchLaundryCatalogIntoIndexedDb } from '@/offline/laundry-catalog-prefetch';
import { flushPendingMutations } from '@/offline/flush-queue';
import type { OfflineMutationKind } from '@/offline/pending-mutation-db';

export type OfflineSyncContextValue = {
  online: boolean;
  pendingCount: number;
  syncing: boolean;
  lastFlushError: string | null;
  refreshPendingCount: () => Promise<void>;
  flushPendingQueue: () => Promise<void>;
  /** Queue a mutation for later replay; returns mutation id when stored. */
  queueMutationForSync: (
    kind: OfflineMutationKind,
    path: string,
    body: unknown,
  ) => Promise<string>;
};

const OfflineSyncContext = createContext<OfflineSyncContextValue | null>(
  null,
);

function readNavigatorOnline(): boolean {
  if (typeof navigator === 'undefined') {
    return true;
  }
  return navigator.onLine;
}

export function OfflineSyncProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { token, user, ownerBranchId } = useAuth();

  const laundryPriceListQueryBranchId = useMemo(() => {
    if (user?.safariRole === 'OWNER' || user?.safariRole === 'GENERAL_MANAGER') {
      return ownerBranchId ?? null;
    }
    return null;
  }, [user?.safariRole, ownerBranchId]);

  const laundryEffectiveBranchId = useMemo(() => {
    if (laundryPriceListQueryBranchId !== null) {
      return laundryPriceListQueryBranchId;
    }
    return user?.branchId ?? null;
  }, [laundryPriceListQueryBranchId, user?.branchId]);
  const [online, setOnline] = useState(readNavigatorOnline);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastFlushError, setLastFlushError] = useState<string | null>(null);
  const flushBusy = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    try {
      const n = await countPendingMutations();
      setPendingCount(n);
    } catch {
      /* ignore */
    }
  }, []);

  const runFlushLocked = useCallback(
    async (): Promise<boolean> => {
      if (!token || !readNavigatorOnline()) {
        return false;
      }
      if (flushBusy.current) {
        return false;
      }
      flushBusy.current = true;
      setSyncing(true);
      setLastFlushError(null);
      try {
        const result = await flushPendingMutations(token);
        await refreshPendingCount();
        if (result.processed > 0) {
          toast.success(
            result.processed === 1
              ? 'تمت مزامنة عملية واحدة بنجاح'
              : `تمت مزامنة ${result.processed} عمليات بنجاح`,
          );
          void fetchAndStorePosCustomerDirectory(token).catch(() => {});
          void prefetchLaundryCatalogIntoIndexedDb({
            token,
            queryBranchId: laundryPriceListQueryBranchId,
            safariRole: user?.safariRole,
            effectiveBranchId: laundryEffectiveBranchId,
          }).catch(() => {});
        }
        if (result.lastError) {
          setLastFlushError(result.lastError);
          toast.error('توقفت المزامنة', { description: result.lastError });
          return false;
        }
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setLastFlushError(msg);
        toast.error('فشل المزامنة', { description: msg });
        return false;
      } finally {
        setSyncing(false);
        flushBusy.current = false;
      }
    },
    [
      token,
      refreshPendingCount,
      laundryPriceListQueryBranchId,
      user?.safariRole,
      laundryEffectiveBranchId,
    ],
  );

  const flushPendingQueue = useCallback(async () => {
    if (!token) {
      return;
    }
    if (!readNavigatorOnline()) {
      toast.message('⚠️', {
        description: 'Offline — لا يمكن المزامنة حتى يعود الاتصال.',
      });
      return;
    }
    await runFlushLocked();
  }, [token, runFlushLocked]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void (async () => {
        if (!token) {
          return;
        }
        if (readNavigatorOnline()) {
          void fetchAndStorePosCustomerDirectory(token).catch(() => {});
          void prefetchLaundryCatalogIntoIndexedDb({
            token,
            queryBranchId: laundryPriceListQueryBranchId,
            safariRole: user?.safariRole,
            effectiveBranchId: laundryEffectiveBranchId,
          }).catch(() => {});
        }
        const n = await countPendingMutations();
        setPendingCount(n);
        if (n > 0) {
          await runFlushLocked();
        }
      })();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [token, runFlushLocked, laundryPriceListQueryBranchId, user?.safariRole, laundryEffectiveBranchId]);

  useEffect(() => {
    void refreshPendingCount();
  }, [refreshPendingCount]);

  useEffect(() => {
    if (!token || !readNavigatorOnline()) {
      return;
    }
    void fetchAndStorePosCustomerDirectory(token).catch(() => {});
    void prefetchLaundryCatalogIntoIndexedDb({
      token,
      queryBranchId: laundryPriceListQueryBranchId,
      safariRole: user?.safariRole,
      effectiveBranchId: laundryEffectiveBranchId,
    }).catch(() => {});
  }, [token, laundryPriceListQueryBranchId, user?.safariRole, laundryEffectiveBranchId]);

  useEffect(() => {
    if (!token) {
      return;
    }
    const intervalMs = 30 * 60_000;
    const id = window.setInterval(() => {
      if (readNavigatorOnline()) {
        void fetchAndStorePosCustomerDirectory(token).catch(() => {});
        void prefetchLaundryCatalogIntoIndexedDb({
          token,
          queryBranchId: laundryPriceListQueryBranchId,
          safariRole: user?.safariRole,
          effectiveBranchId: laundryEffectiveBranchId,
        }).catch(() => {});
      }
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [token, laundryPriceListQueryBranchId, user?.safariRole, laundryEffectiveBranchId]);

  const queueMutationForSync = useCallback(
    async (
      kind: OfflineMutationKind,
      path: string,
      body: unknown,
    ): Promise<string> => {
      const id = await enqueuePendingMutation({ kind, path, body });
      await refreshPendingCount();
      return id;
    },
    [refreshPendingCount],
  );

  const value = useMemo<OfflineSyncContextValue>(
    () => ({
      online,
      pendingCount,
      syncing,
      lastFlushError,
      refreshPendingCount,
      flushPendingQueue,
      queueMutationForSync,
    }),
    [
      online,
      pendingCount,
      syncing,
      lastFlushError,
      refreshPendingCount,
      flushPendingQueue,
      queueMutationForSync,
    ],
  );

  return (
    <OfflineSyncContext.Provider value={value}>
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSync(): OfflineSyncContextValue {
  const ctx = useContext(OfflineSyncContext);
  if (!ctx) {
    throw new Error('useOfflineSync must run under OfflineSyncProvider');
  }
  return ctx;
}

/** Optional variant for components that might render outside the provider. */
export function useOfflineSyncOptional(): OfflineSyncContextValue | null {
  return useContext(OfflineSyncContext);
}
