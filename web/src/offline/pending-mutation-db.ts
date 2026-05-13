/**
 * IndexedDB-backed durable queue for mutations when Safari ERP web is offline.
 * Version 1 — FIFO by `createdAt`; each row carries a UUID primary key (`id`).
 */

import Dexie, { type Table } from 'dexie';
import type {
  CustomerSearchRow,
  LaundryItemCategoryRow,
  LaundryPriceListItemRow,
} from '@/lib/api';

export type OfflineMutationKind =
  /** Phase 2+ — unified POS checkout payload */
  | 'pos_checkout'
  | 'payment'
  | 'debt_settlement'
  | 'generic_post';

export type PendingMutationRecord = {
  /** Client-generated UUID (queue row identity; never collide with DB autoincrement). */
  id: string;
  kind: OfflineMutationKind;
  /** POST path-only (e.g. `/api/orders/pos-checkout`) — same convention as apiJson(). */
  path: string;
  method: 'POST';
  payloadJson: string;
  /** ms epoch */
  createdAt: number;
  attempts: number;
  lastError?: string;
};

/** Same projection as `/api/pos/customers/search` rows + local `cachedAt`. */
export type CachedCustomerRecord = CustomerSearchRow & {
  cachedAt: number;
};

/**
 * Last-known-good laundry POS catalog (items + categories + version) per
 * branch / role slot — see `buildPosLaundryMetadataCacheId`.
 */
export type PosLaundryMetadataRecord = {
  id: string;
  /** Full API list (before inactive filter); callers filter for display. */
  itemsRaw: LaundryPriceListItemRow[];
  categories: LaundryItemCategoryRow[];
  effectiveBranchId: string | null;
  catalogVersion: string | null;
  cachedAt: number;
};

class SafariOfflineQueueDb extends Dexie {
  pendingMutations!: Table<PendingMutationRecord, string>;
  customersCache!: Table<CachedCustomerRecord, string>;
  posMetadata!: Table<PosLaundryMetadataRecord, string>;

  constructor() {
    super('safari-erp-offline-v1');
    this.version(1).stores({
      pendingMutations: 'id, createdAt, kind',
    });
    this.version(2).stores({
      pendingMutations: 'id, createdAt, kind',
      customersCache: 'id, cachedAt',
    });
    this.version(3).stores({
      pendingMutations: 'id, createdAt, kind',
      customersCache: 'id, cachedAt',
      posMetadata: 'id, cachedAt',
    });
  }
}

let dbInstance: SafariOfflineQueueDb | null = null;

export function getOfflineQueueDb(): SafariOfflineQueueDb {
  if (!dbInstance) {
    dbInstance = new SafariOfflineQueueDb();
  }
  return dbInstance;
}

/**
 * Clears every table in the offline database on logout.
 *
 * Called fire-and-forget from `clearSession` in AuthContext so PII
 * (customersCache) and pending mutations from the previous session
 * cannot be read by the next user on the same device.
 *
 * Uses Promise.allSettled so a failure on one table does not prevent
 * the others from being cleared. Silently swallows all errors because
 * the access token is already invalid by the time this runs.
 */
export async function clearOfflineDb(): Promise<void> {
  try {
    const db = getOfflineQueueDb();
    await Promise.allSettled([
      db.pendingMutations.clear(),
      db.customersCache.clear(),
      db.posMetadata.clear(),
    ]);
  } catch {
    // Silently swallow — tokens are already cleared; DB clear is
    // best-effort to remove PII and stale mutations.
  }
}
