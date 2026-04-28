/**
 * enqueue / FIFO read / purge — Dexie accessors for the offline mutation queue.
 */

import {
  type OfflineMutationKind,
  type PendingMutationRecord,
  getOfflineQueueDb,
} from '@/offline/pending-mutation-db';

export async function enqueuePendingMutation(opts: {
  kind: OfflineMutationKind;
  path: string;
  body: unknown;
}): Promise<string> {
  const path = opts.path.startsWith('/') ? opts.path : `/${opts.path}`;
  const id = crypto.randomUUID();
  await getOfflineQueueDb().pendingMutations.put({
    id,
    kind: opts.kind,
    path,
    method: 'POST',
    payloadJson: JSON.stringify(opts.body ?? {}),
    createdAt: Date.now(),
    attempts: 0,
  });
  return id;
}

export async function countPendingMutations(): Promise<number> {
  return getOfflineQueueDb().pendingMutations.count();
}

export async function deletePendingMutation(id: string): Promise<void> {
  await getOfflineQueueDb().pendingMutations.delete(id);
}

/** Strict FIFO — oldest createdAt first */
export async function listPendingFifo(): Promise<PendingMutationRecord[]> {
  return getOfflineQueueDb().pendingMutations.orderBy('createdAt').toArray();
}

export async function bumpMutationFailure(
  id: string,
  error: string,
): Promise<void> {
  const db = getOfflineQueueDb();
  const row = await db.pendingMutations.get(id);
  if (!row) {
    return;
  }
  await db.pendingMutations.put({
    ...row,
    attempts: row.attempts + 1,
    lastError: error.slice(0, 500),
  });
}
