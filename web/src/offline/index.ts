/**
 * Offline queue (Dexie IndexedDB) + connectivity UI.
 *
 * Phase 2+: import {@link enqueuePendingMutation} or use
 * {@link useOfflineSync}().queueMutationForSync(...) from mutations when
 * `!navigator.onLine`.
 */

export type {
  OfflineMutationKind,
  PendingMutationRecord,
} from './pending-mutation-db';
export { getOfflineQueueDb } from './pending-mutation-db';
export {
  enqueuePendingMutation,
  countPendingMutations,
  deletePendingMutation,
  listPendingFifo,
  bumpMutationFailure,
} from './queue-ops';
export { flushPendingMutations } from './flush-queue';
export {
  OfflineSyncProvider,
  useOfflineSync,
  useOfflineSyncOptional,
  type OfflineSyncContextValue,
} from './offline-sync-context';
export { ConnectivityBadge } from './connectivity-badge';
export { OfflineGlobalAlerts } from './offline-global-alerts';
export {
  fetchAndStorePosCustomerDirectory,
  mergeSearchHitsIntoCustomerCache,
  searchCustomerDirectoryOfflineAsync,
  invalidateCustomerDirectoryMemory,
} from './customer-cache';
export {
  buildPosLaundryMetadataCacheId,
  loadPosLaundryMetadata,
  savePosLaundryMetadata,
} from './pos-metadata-cache';
export { prefetchLaundryCatalogIntoIndexedDb } from './laundry-catalog-prefetch';
