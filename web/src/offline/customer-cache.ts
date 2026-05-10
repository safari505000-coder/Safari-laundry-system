/**
 * POS customer directory snapshot for hybrid search (Dexie + in-memory filter).
 */

import { apiJson } from '@/lib/api';
import type { CustomerSearchRow } from '@/lib/api';
import {
  getOfflineQueueDb,
  type CachedCustomerRecord,
} from '@/offline/pending-mutation-db';

const POS_CACHE_PATH = '/api/pos/customers/cache';

/** In-memory replica for fast substring search (invalidated on rebuild/merge). */
let memoryDirectory: CustomerSearchRow[] | null = null;

export function invalidateCustomerDirectoryMemory(): void {
  memoryDirectory = null;
}

async function loadAllRowsFromDb(): Promise<CachedCustomerRecord[]> {
  return getOfflineQueueDb().customersCache.toArray();
}

function toSearchRow(r: CachedCustomerRecord): CustomerSearchRow {
  const { cachedAt: _cachedAt, ...rest } = r;
  return rest;
}

function normalizeSearchRow(r: CustomerSearchRow): CustomerSearchRow {
  const createdAt =
    typeof r.createdAt === 'string' ?
      r.createdAt
    : (r.createdAt as unknown as Date)?.toISOString?.() ??
      new Date().toISOString();
  return {
    ...r,
    createdAt,
    wallet:
      r.wallet ?
        {
          balance: String(r.wallet.balance),
          // allow-legacy-debt-reader (V20.6 Phase 2: IndexedDB offline cache mirrors the server's wallet shape verbatim; no UI computation)
          debt: String(r.wallet.debt),
        }
      : null,
  };
}

/** Save full directory from server (bulk replace). */
export async function rebuildCustomerDirectoryCache(
  rows: CustomerSearchRow[],
): Promise<void> {
  const now = Date.now();
  const normalized: CachedCustomerRecord[] = rows.map((r) => ({
    ...normalizeSearchRow(r),
    cachedAt: now,
  }));
  const db = getOfflineQueueDb();
  await db.transaction('rw', db.customersCache, async () => {
    await db.customersCache.clear();
    if (normalized.length > 0) {
      await db.customersCache.bulkPut(normalized);
    }
  });
  invalidateCustomerDirectoryMemory();
}

/** Merge search API hits so recent online queries improve the cache without full fetch. */
export async function mergeSearchHitsIntoCustomerCache(
  rows: CustomerSearchRow[],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const now = Date.now();
  const db = getOfflineQueueDb();
  await db.transaction('rw', db.customersCache, async () => {
    for (const r of rows) {
      await db.customersCache.put({
        ...normalizeSearchRow(r),
        cachedAt: now,
      });
    }
  });
  invalidateCustomerDirectoryMemory();
}

export async function fetchAndStorePosCustomerDirectory(
  token: string,
): Promise<number> {
  const rows = await apiJson<CustomerSearchRow[]>(POS_CACHE_PATH, {
    token,
  });
  await rebuildCustomerDirectoryCache(rows);
  return rows.length;
}

function normalizeDigitRun(s: string): string {
  return s.replace(/\D/g, '').trim();
}

function rowMatches(
  r: CustomerSearchRow,
  qLower: string,
  qDigits: string,
): boolean {
  const phone = (r.phone ?? '').toLowerCase();
  const phone2 = (r.phone2 ?? '').toLowerCase();
  const name = (r.displayName ?? '').toLowerCase();
  const addr = (r.address ?? '').toLowerCase();
  const parts = [
    r.addressArea,
    r.addressBlock,
    r.addressStreet,
    r.addressAvenue,
    r.addressHouse,
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());
  if (
    phone.includes(qLower) ||
    phone2.includes(qLower) ||
    name.includes(qLower) ||
    addr.includes(qLower) ||
    parts.some((p) => p.includes(qLower))
  ) {
    return true;
  }
  if (qDigits.length >= 2) {
    if (normalizeDigitRun(phone).includes(qDigits)) {
      return true;
    }
    if (phone2 && normalizeDigitRun(phone2).includes(qDigits)) {
      return true;
    }
  }
  return false;
}

/**
 * Debounced caller should use this — loads IndexedDB once per session into RAM
 * then substring-matches (mirrors server-side OR intent for phones & names).
 */
export async function searchCustomerDirectoryOfflineAsync(
  query: string,
  limit = 50,
): Promise<CustomerSearchRow[]> {
  const q = query.trim();
  if (q.length < 2) {
    return [];
  }
  if (!memoryDirectory || memoryDirectory.length === 0) {
    const stored = await loadAllRowsFromDb();
    memoryDirectory = stored.map(toSearchRow);
  }
  const qLower = q.toLowerCase();
  const qDigits = normalizeDigitRun(q);
  const out: CustomerSearchRow[] = [];
  const src = memoryDirectory;
  for (const r of src) {
    if (rowMatches(r, qLower, qDigits)) {
      out.push(r);
      if (out.length >= limit) {
        break;
      }
    }
  }
  return out;
}
