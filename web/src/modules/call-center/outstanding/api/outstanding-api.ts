/**
 * V19.x — Outstanding-Payments / Accounts-Receivable API client.
 *
 * Mirrors the NestJS `OutstandingController` (src/finance/outstanding):
 *   - GET   /api/finance/outstanding              (READ_ROLES)
 *   - POST  /api/finance/outstanding/export       (READ_ROLES)
 *   - GET   /api/finance/customer/:id/status      (READ_ROLES)
 *   - PATCH /api/finance/customer/:id/status      (CALL_CENTER+ / OWNER)
 *
 * Type aliases here are kept in lock-step with the backend DTOs in
 * src/finance/outstanding/dto/. Update both sides whenever a field
 * moves.
 */
import { ApiError, apiJson } from '@/lib/api';

export type CustomerCollectionStatusKind = 'NORMAL' | 'LATE' | 'RISK';

export type OutstandingRow = {
  customerId: string;
  name: string | null;
  phone: string;
  phone2: string | null;
  driverId: string | null;
  driverName: string | null;
  /**
   * V23.3 — Canonical KWD string (4dp, banker-rounded). Type changed
   * from `number` to `string` for canonical-money-purity alignment.
   * Sort comparators MUST use `compareKwdStrings` rather than raw
   * subtraction.
   */
  totalDueKd: string;
  /**
   * V20.3.1 / V23.3 — Σ remaining (gross − payments − wallet
   * absorption), canonical 4dp KWD string.
   */
  remainingDueKd?: string;
  /**
   * V20.3.1 / V23.3 — Σ paid (real PAYMENT rows; excludes wallet
   * absorption), canonical 4dp KWD string.
   */
  paidKd?: string;
  invoicesCount: number;
  lastOrderAt: string | null;
  earliestDueDate: string | null;
  daysLate: number;
  priorityScore: number;
  status: CustomerCollectionStatusKind;
  blocked: boolean;
  note: string | null;
  hasActiveSubscription?: boolean;
  subscriptionExpiresAt?: string | null;
};

export type OutstandingResponse = {
  rows: OutstandingRow[];
  totalCustomers: number;
  totalInvoices: number;
  driverSummaries?: Array<{
    driverId: string | null;
    driverName: string;
    customers: number;
    invoices: number;
    totalRemainingKd: string;
    maxDaysLate: number;
  }>;
  totalDueKd: string;
  source: 'COLLECTIONS_ENGINE';
  blockedCount: number;
  lateCount: number;
  riskCount: number;
  generatedAt: string;
  fromIso: string;
  toIso: string;
};

export type OutstandingFilters = {
  from?: string;
  to?: string;
  /** Matches Collections / ops-summary branch scope when set (OWNER / GM pickers). */
  branchId?: string;
  driverId?: string;
  customerId?: string;
  status?: CustomerCollectionStatusKind;
  search?: string;
  blocked?: boolean;
};

export type CustomerCollectionStatusDto = {
  customerId: string;
  status: CustomerCollectionStatusKind;
  blocked: boolean;
  note: string | null;
  updatedAt: string;
  updatedById: string | null;
};

export type UpdateCustomerCollectionStatusInput = {
  status: CustomerCollectionStatusKind;
  blocked: boolean;
  note?: string;
};

function buildQs(filters: OutstandingFilters): string {
  const qs = new URLSearchParams();
  if (filters.from) qs.set('from', filters.from);
  if (filters.to) qs.set('to', filters.to);
  if (filters.branchId) qs.set('branchId', filters.branchId);
  if (filters.driverId) qs.set('driverId', filters.driverId);
  if (filters.customerId) qs.set('customerId', filters.customerId);
  if (filters.status) qs.set('status', filters.status);
  if (filters.search) qs.set('search', filters.search);
  if (typeof filters.blocked === 'boolean')
    qs.set('blocked', String(filters.blocked));
  const out = qs.toString();
  return out ? `?${out}` : '';
}

export function listOutstanding(
  token: string | null,
  filters: OutstandingFilters,
  opts?: { signal?: AbortSignal },
): Promise<OutstandingResponse> {
  const path = `/api/finance/outstanding${buildQs(filters)}`;
  return fetch(path, {
    signal: opts?.signal,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
    .then(async (res) => {
      const text = await res.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      if (!res.ok) {
        console.error('OUTSTANDING ERROR', {
          status: res.status,
          body,
        });
        throw new ApiError(
          typeof body === 'object' &&
            body !== null &&
            'message' in body &&
            typeof body.message === 'string'
            ? body.message
            : `outstanding failed: ${res.status}`,
          res.status,
        );
      }
      if (
        typeof body === 'object' &&
        body !== null &&
        'data' in body
      ) {
        return body.data as OutstandingResponse;
      }
      return body as OutstandingResponse;
    })
    .catch((error) => {
      if (error instanceof ApiError || opts?.signal?.aborted) throw error;
      console.error('OUTSTANDING ERROR', error);
      throw error;
    })
    .then((response) => {
    if (
      typeof response.totalDueKd !== 'string' &&
      typeof response.totalDueKd !== 'number'
    ) {
      console.error('OUTSTANDING ERROR', {
        reason: 'Invalid totalDue source',
        response,
      });
      response.totalDueKd = '0.0000';
    }
    if (response.source !== 'COLLECTIONS_ENGINE') {
      console.error('OUTSTANDING ERROR', {
        reason: 'Missing COLLECTIONS_ENGINE source',
        response,
      });
    }
    return {
      ...response,
      totalDueKd: String(response.totalDueKd),
      source: 'COLLECTIONS_ENGINE',
    };
  });
}

export function getCollectionStatus(
  token: string | null,
  customerId: string,
  opts?: { signal?: AbortSignal },
): Promise<CustomerCollectionStatusDto> {
  return apiJson<CustomerCollectionStatusDto>(
    `/api/finance/customer/${customerId}/status`,
    { token, signal: opts?.signal },
  );
}

export function updateCollectionStatus(
  token: string | null,
  customerId: string,
  input: UpdateCustomerCollectionStatusInput,
): Promise<CustomerCollectionStatusDto> {
  return apiJson<CustomerCollectionStatusDto>(
    `/api/finance/customer/${customerId}/status`,
    {
      token,
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}

/**
 * Export the current view as XLSX. Returns a `Blob` so callers can
 * either trigger a download (default) or upload it.
 */
export async function exportOutstandingXlsx(
  token: string | null,
  filters: OutstandingFilters,
): Promise<{ blob: Blob; filename: string }> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch('/api/finance/outstanding/export', {
    method: 'POST',
    headers,
    body: JSON.stringify(filters),
  });
  if (!res.ok) {
    throw new Error(`outstanding-export failed: ${res.status}`);
  }
  const cd = res.headers.get('content-disposition') ?? '';
  const match = /filename="?([^"]+)"?/.exec(cd);
  const filename = match?.[1] ?? `outstanding-${new Date()
    .toISOString()
    .slice(0, 10)}.xlsx`;
  const blob = await res.blob();
  return { blob, filename };
}
