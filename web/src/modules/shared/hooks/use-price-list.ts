import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { useSafariStream } from '@/contexts/safari-stream-context';
import {
  type LaundryItemCategoryRow,
  type LaundryPriceListItemRow,
  apiJson,
  ApiError,
} from '@/lib/api';

export function buildLaundryPriceListPath(
  branchId: string | null | undefined,
): string {
  if (branchId && branchId.length > 0) {
    return `/api/laundry-price-list?branchId=${encodeURIComponent(branchId)}`;
  }
  return '/api/laundry-price-list';
}

/** Resolves which branch drives merged list prices (JWT default vs explicit preview). */
export function useLaundryPricingBranchId(opts?: {
  /** When set, overrides role-based defaults (e.g. manager branch preview). */
  previewBranchId?: string | null;
}): string | null {
  const { user, ownerBranchId } = useAuth();
  return useMemo(() => {
    if (opts?.previewBranchId !== undefined) {
      return opts.previewBranchId ?? null;
    }
    if (user?.safariRole === 'OWNER') return ownerBranchId;
    return user?.branchId ?? null;
  }, [
    opts?.previewBranchId,
    ownerBranchId,
    user?.branchId,
    user?.safariRole,
  ]);
}

export type PriceListBridge = {
  items: LaundryPriceListItemRow[];
  categories: LaundryItemCategoryRow[];
  loading: boolean;
  failed: boolean;
  reload: () => Promise<void>;
  /** Branch used for merged pricing in this snapshot (null = master list only). */
  branchId: string | null;
};

type UsePriceListOpts = {
  token: string | null;
  /** When provided, forces that branch for merged prices instead of JWT / owner picker defaults. */
  branchId?: string | null;
};

/**
 * Shared data bridge for `LaundryPriceListService` output (items + categories, branch merge).
 */
export function usePriceList(opts: UsePriceListOpts): PriceListBridge {
  const { token } = opts;
  const { user, ownerBranchId } = useAuth();
  const { t } = useTranslation();

  const effectiveBranchId = useMemo(() => {
    if (opts.branchId !== undefined) return opts.branchId ?? null;
    if (user?.safariRole === 'OWNER') return ownerBranchId;
    return user?.branchId ?? null;
  }, [opts.branchId, ownerBranchId, user?.branchId, user?.safariRole]);

  const [items, setItems] = useState<LaundryPriceListItemRow[]>([]);
  const [categories, setCategories] = useState<LaundryItemCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    if (!token) {
      setItems([]);
      setCategories([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      const listPath = buildLaundryPriceListPath(effectiveBranchId);
      const listData = await apiJson<LaundryPriceListItemRow[]>(listPath, {
        token,
      });
      let catData: LaundryItemCategoryRow[] = [];
      try {
        catData = await apiJson<LaundryItemCategoryRow[]>(
          '/api/laundry-price-list/categories',
          { token },
        );
      } catch (e) {
        // Backward compatibility for environments where categories endpoint
        // has not been deployed yet.
        if (!(e instanceof ApiError) || e.status !== 404) {
          throw e;
        }
      }
      setItems(Array.isArray(listData) ? listData : []);
      setCategories(Array.isArray(catData) ? catData : []);
    } catch (e) {
      setItems([]);
      setCategories([]);
      setFailed(true);
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error(t('pos.catalogLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [token, effectiveBranchId, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Cross-device sync: when the OWNER edits prices, the server's
  // `priceListVersion` (exposed via SafariStream snapshot) changes. The stream
  // provider polls every 45s, so every session — including Driver POS — picks
  // up the new tariff without a dedicated push channel or a manual refresh.
  const { snapshot } = useSafariStream();
  const lastSyncedVersionRef = useRef<string | null>(null);
  useEffect(() => {
    const v = snapshot?.priceListVersion;
    if (!v) return;
    if (lastSyncedVersionRef.current === null) {
      lastSyncedVersionRef.current = v;
      return;
    }
    if (lastSyncedVersionRef.current !== v) {
      lastSyncedVersionRef.current = v;
      void reload();
    }
  }, [snapshot?.priceListVersion, reload]);

  return {
    items,
    categories,
    loading,
    failed,
    reload,
    branchId: effectiveBranchId,
  };
}
