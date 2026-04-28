/**
 * One-shot fetch + IndexedDB persistence for POS laundry catalog (login / connectivity refresh).
 */

import {
  apiJson,
  ApiError,
  type LaundryItemCategoryRow,
  type LaundryPriceListItemRow,
} from '@/lib/api';
import { buildLaundryPriceListPath } from '@/modules/shared/hooks/use-price-list';
import {
  buildPosLaundryMetadataCacheId,
  savePosLaundryMetadata,
} from '@/offline/pos-metadata-cache';

export async function prefetchLaundryCatalogIntoIndexedDb(opts: {
  token: string;
  queryBranchId: string | null;
  safariRole: string | null | undefined;
  /** Same as {@link import('@/modules/shared/hooks/use-price-list').buildLaundryPriceListPath}; merged branch for bookkeeping. */
  effectiveBranchId: string | null;
}): Promise<void> {
  const listPath = buildLaundryPriceListPath(
    opts.queryBranchId,
    opts.safariRole,
  );
  const listData = await apiJson<LaundryPriceListItemRow[]>(listPath, {
    token: opts.token,
  });
  let catData: LaundryItemCategoryRow[] = [];
  try {
    catData = await apiJson<LaundryItemCategoryRow[]>(
      '/api/laundry-price-list/categories',
      { token: opts.token },
    );
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 404) {
      throw e;
    }
  }
  let catalogVersion: string | null = null;
  try {
    const { version } = await apiJson<{ version: string }>(
      '/api/laundry-price-list/catalog-version',
      { token: opts.token },
    );
    if (version) catalogVersion = version;
  } catch {
    /* ok */
  }
  const rawItems = Array.isArray(listData) ? listData : [];
  const cats = Array.isArray(catData) ? catData : [];
  const cacheId = buildPosLaundryMetadataCacheId(
    opts.safariRole,
    opts.queryBranchId,
  );
  await savePosLaundryMetadata({
    cacheId,
    itemsRaw: rawItems,
    categories: cats,
    effectiveBranchId: opts.effectiveBranchId,
    catalogVersion,
  });
}
