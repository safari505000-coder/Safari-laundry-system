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
import {
  buildPosLaundryMetadataCacheId,
  loadPosLaundryMetadata,
  savePosLaundryMetadata,
} from '@/offline/pos-metadata-cache';

/** POS / Driver — keep row unless explicitly soft-hidden (`isActive=false`). */
export function rowShowsInLiveCatalog(row: LaundryPriceListItemRow): boolean {
  const v = row.isActive as unknown;
  if (v === false || v === 0) return false;
  if (typeof v === 'string' && v.trim().toLowerCase() === 'false') {
    return false;
  }
  return true;
}

/**
 * `?branchId=` is only valid for OWNER / GENERAL_MANAGER (branch preview).
 * For MANAGER / DRIVER the API ignores the query and uses JWT `branchId`;
 * sending the param provokes 400 from the server.
 */
export function buildLaundryPriceListPath(
  branchId: string | null | undefined,
  safariRole: string | null | undefined = undefined,
): string {
  const isExec =
    safariRole === 'OWNER' || safariRole === 'GENERAL_MANAGER';
  if (isExec && branchId && String(branchId).trim().length > 0) {
    return `/api/laundry-price-list?branchId=${encodeURIComponent(String(branchId).trim())}`;
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
    if (user?.safariRole === 'OWNER' || user?.safariRole === 'GENERAL_MANAGER') {
      return ownerBranchId;
    }
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
  /**
   * Owner management screens flip this on so hidden (isActive=false) items
   * remain visible for editing. POS / Driver callers leave it off and get a
   * clean catalog that mirrors what the shop floor should see.
   */
  includeInactive?: boolean;
};

/**
 * Shared data bridge for `LaundryPriceListService` output (items + categories, branch merge).
 */
export function usePriceList(opts: UsePriceListOpts): PriceListBridge {
  const { token, includeInactive = false } = opts;
  const { user, ownerBranchId } = useAuth();
  const { snapshot } = useSafariStream();
  const { t } = useTranslation();

  /*
   * The backend accepts `?branchId=` ONLY for OWNER / GENERAL_MANAGER (preview).
   * For MANAGER / DRIVER / others, the branch is taken from the JWT, so we must
   * NOT send the query parameter — otherwise the server rejects the request
   * with "branchId query parameter is only allowed for OWNER or GENERAL_MANAGER".
   * `queryBranchId` is what we put on the URL; `null` means omit it.
   */
  const queryBranchId = useMemo<string | null>(() => {
    if (opts.branchId !== undefined) return opts.branchId ?? null;
    if (user?.safariRole === 'OWNER' || user?.safariRole === 'GENERAL_MANAGER') {
      return ownerBranchId;
    }
    return null;
  }, [opts.branchId, ownerBranchId, user?.safariRole]);

  /** Branch actually used for merged pricing — for UI surfaces and callers. */
  const effectiveBranchId = useMemo(() => {
    if (queryBranchId !== null) return queryBranchId;
    return user?.branchId ?? null;
  }, [queryBranchId, user?.branchId]);

  const [items, setItems] = useState<LaundryPriceListItemRow[]>([]);
  const [categories, setCategories] = useState<LaundryItemCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const lastCatalogVersionRef = useRef<string | null>(null);
  const lastStreamPriceListVRef = useRef<string | null>(null);

  const reload = useCallback(async () => {
    if (!token) {
      setItems([]);
      setCategories([]);
      setLoading(false);
      setFailed(false);
      return;
    }

    const cacheId = buildPosLaundryMetadataCacheId(
      user?.safariRole,
      queryBranchId,
    );
    let hadStoredSnapshot = false;

    try {
      const cached = await loadPosLaundryMetadata(cacheId);
      if (cached != null) {
        hadStoredSnapshot = true;
        const rawItems = Array.isArray(cached.itemsRaw) ? cached.itemsRaw : [];
        const visibleItems = includeInactive
          ? rawItems
          : rawItems.filter(rowShowsInLiveCatalog);
        setItems(visibleItems);
        setCategories(Array.isArray(cached.categories) ? cached.categories : []);
        if (cached.catalogVersion) {
          lastCatalogVersionRef.current = cached.catalogVersion;
        }
        setFailed(false);
        setLoading(false);
      }
    } catch {
      /* IndexedDB optional */
    }

    const online =
      typeof navigator === 'undefined' ? true : navigator.onLine;
    if (!online) {
      if (hadStoredSnapshot) {
        return;
      }
      setItems([]);
      setCategories([]);
      setFailed(true);
      setLoading(false);
      return;
    }

    if (!hadStoredSnapshot) {
      setLoading(true);
    }
    setFailed(false);
    try {
      const listPath = buildLaundryPriceListPath(
        queryBranchId,
        user?.safariRole,
      );
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
      const rawItems = Array.isArray(listData) ? listData : [];
      const visibleItems = includeInactive
        ? rawItems
        : rawItems.filter(rowShowsInLiveCatalog);
      setItems(visibleItems);
      const cats = Array.isArray(catData) ? catData : [];
      setCategories(cats);

      let catalogVersion: string | null = null;
      try {
        const { version } = await apiJson<{ version: string }>(
          '/api/laundry-price-list/catalog-version',
          { token },
        );
        if (version) {
          catalogVersion = version;
          lastCatalogVersionRef.current = version;
        }
      } catch {
        /* keep prior ref — poll will recover */
      }

      await savePosLaundryMetadata({
        cacheId,
        itemsRaw: rawItems,
        categories: cats,
        effectiveBranchId,
        catalogVersion: catalogVersion ?? lastCatalogVersionRef.current,
      });
    } catch (e) {
      if (hadStoredSnapshot) {
        setFailed(false);
      } else {
        setItems([]);
        setCategories([]);
        setFailed(true);
        if (
          e instanceof ApiError &&
          e.status !== 0
        ) {
          toast.error(e.message);
        } else if (!(e instanceof ApiError)) {
          toast.error(t('pos.catalogLoadFailed'));
        }
      }
    } finally {
      setLoading(false);
    }
  }, [
    token,
    queryBranchId,
    includeInactive,
    t,
    user?.safariRole,
    effectiveBranchId,
  ]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Cross-device sync: `getCatalogVersion()` on the server moves whenever the
  // owner edits the master tariff, categories, or branch overrides. We poll a
  // **light** `/catalog-version` endpoint so Driver + branch Manager POS pick
  // up catalog changes within a few seconds, and on tab focus.
  const checkCatalogVersion = useCallback(async () => {
    if (!token) return;
    try {
      const { version } = await apiJson<{ version: string }>(
        '/api/laundry-price-list/catalog-version',
        { token },
      );
      if (!version) return;
      if (lastCatalogVersionRef.current === null) {
        lastCatalogVersionRef.current = version;
        return;
      }
      if (lastCatalogVersionRef.current !== version) {
        lastCatalogVersionRef.current = version;
        void reload();
      }
    } catch {
      // Silent — the list from the last full `reload()` stays; user can refresh manually.
    }
  }, [token, reload]);

  useEffect(() => {
    if (!token) return;
    const POLL_MS = 10_000;
    void checkCatalogVersion();
    const id = window.setInterval(() => {
      void checkCatalogVersion();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [token, checkCatalogVersion]);

  // Same version string as `GET /catalog-version`, embedded in SafariStream.
  // When Owner/GM saves in «إدارة الأصناف», `refreshStream()` bumps this
  // immediately in-session so Driver / Manager POS reload without waiting
  // only on the lightweight poll.
  useEffect(() => {
    if (!token) return;
    const v = snapshot?.priceListVersion;
    if (!v) return;
    if (lastStreamPriceListVRef.current === null) {
      lastStreamPriceListVRef.current = v;
      return;
    }
    if (lastStreamPriceListVRef.current !== v) {
      lastStreamPriceListVRef.current = v;
      void reload();
    }
  }, [token, snapshot?.priceListVersion, reload]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void checkCatalogVersion();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [checkCatalogVersion]);

  return {
    items,
    categories,
    loading,
    failed,
    reload,
    branchId: effectiveBranchId,
  };
}
