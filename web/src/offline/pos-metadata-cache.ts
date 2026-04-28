/**
 * Persisted POS laundry catalog (Dexie `posMetadata`) — last known good items + categories.
 */

import { getOfflineQueueDb, type PosLaundryMetadataRecord } from '@/offline/pending-mutation-db';
import type { LaundryItemCategoryRow, LaundryPriceListItemRow } from '@/lib/api';

export function buildPosLaundryMetadataCacheId(
  safariRole: string | null | undefined,
  queryBranchId: string | null,
): string {
  return `${safariRole ?? 'unknown'}:${queryBranchId ?? 'jwt-branch'}`;
}

export async function loadPosLaundryMetadata(
  cacheId: string,
): Promise<PosLaundryMetadataRecord | undefined> {
  return getOfflineQueueDb().posMetadata.get(cacheId);
}

export async function savePosLaundryMetadata(input: {
  cacheId: string;
  itemsRaw: LaundryPriceListItemRow[];
  categories: LaundryItemCategoryRow[];
  effectiveBranchId: string | null;
  catalogVersion: string | null;
}): Promise<void> {
  const now = Date.now();
  const row: PosLaundryMetadataRecord = {
    id: input.cacheId,
    itemsRaw: input.itemsRaw,
    categories: input.categories,
    effectiveBranchId: input.effectiveBranchId,
    catalogVersion: input.catalogVersion,
    cachedAt: now,
  };
  await getOfflineQueueDb().posMetadata.put(row);
}
