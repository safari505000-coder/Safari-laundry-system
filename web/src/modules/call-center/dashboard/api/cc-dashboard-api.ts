/**
 * Call Center → Customer 360 Dashboard — API client.
 *
 * This is a thin wrapper over the shared `apiJson` fetch helper. We
 * keep the surface here intentionally small (5 mutations + 1 list
 * endpoint) because everything else the dashboard needs already lives
 * in `@/lib/api` (`getCustomer360`, customer search via the directory
 * bridge, etc.).
 *
 * Backend endpoints consumed:
 *   - GET  /api/call-center/dispatch/active                     (MANAGE_DISPATCH)
 *   - GET  /api/call-center/drivers                             (MANAGE_DISPATCH)
 *   - POST /api/call-center/dispatch                            (MANAGE_DISPATCH)
 *   - POST /api/call-center/dispatch/:id/reassign               (MANAGE_DISPATCH)
 *   - POST /api/customers/:id/block                             (MANAGE_CUSTOMER_BLOCK)
 *   - POST /api/customers/:id/unblock                           (MANAGE_CUSTOMER_BLOCK)
 *
 * The dashboard does NOT call /api/audit/logs (OWNER/GM/ACCOUNTANT
 * only) or /api/cash-intelligence/* (no CC permission). The Risk &
 * Control tab is composed from the Customer 360 payload's `rating`,
 * `score`, `insights`, and `alerts` fields, all of which the same CC
 * role is already authorised to read.
 */
import { apiJson } from '@/lib/api';

/** Bypass intermediary caches for polling-heavy CC dashboard reads. */
const CC_DASHBOARD_FETCH_HEADERS: HeadersInit = {
  'Cache-Control': 'no-cache',
};

// ─── Types mirrored from backend DTOs ────────────────────────────────

/**
 * Dispatch severity is computed on the server (`elapsedMs` thresholds:
 * <10m ON_TIME, ≥10m LATE, ≥20m CRITICAL). The UI must render the
 * field as-is and never recompute it from raw timestamps.
 */
export type DispatchSeverity =
  | 'ON_TIME'
  | 'LATE'
  | 'CRITICAL'
  | 'COMPLETED';

export type DispatchStatus =
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type DispatchSlaTone = 'NORMAL' | 'LATE' | 'BREACH';

export type DispatchRow = {
  id: string;
  status: DispatchStatus;
  severity: DispatchSeverity;
  elapsedMinutes: number;
  customerId: string;
  customerDisplay: string;
  customerPhone: string;
  driverId: string;
  driverName: string;
  instructionNote: string | null;
  createdAtIso: string;
  acknowledgedAtIso?: string | null;
  completedAtIso: string | null;
  completedByOrderId: string | null;
  startedAtIso?: string | null;
  firstAlertAtIso?: string | null;
  escalatedAtIso?: string | null;
  breachedAtIso?: string | null;
  ackMinutes?: number | null;
  totalMinutes?: number | null;
  slaTone?: DispatchSlaTone;
};

export type DispatchSnapshot = {
  /**
   * Server clock at projection time. The UI MUST use this as the
   * reference for relative-time rendering (NEVER `new Date()`), to
   * stay aligned with server-computed severity.
   */
  generatedAtIso: string;
  rows: DispatchRow[];
};

export type CreateDispatchInput = {
  customerId: string;
  driverId: string;
  instructionNote?: string;
};

export type ReassignDispatchInput = {
  newDriverId: string;
  reason?: string;
};

export type BlockCustomerInput = {
  reason: string;
};

export type UnblockCustomerInput = {
  reason?: string;
};

export type CustomerBlockSnapshot = {
  id: string;
  isBlocked: boolean;
  blockReason: string | null;
  blockedAt: string | null;
};

/**
 * V19.x — Driver row exposed by `GET /api/call-center/drivers`. Mirrors
 * `DispatchDriverDto` on the backend. Intentionally narrow: name +
 * id + isActive + currently-held workload count. Adding any other
 * field requires a backend RBAC review first.
 */
export type CcDriverRow = {
  id: string;
  name: string;
  isActive: boolean;
  activeLoad: number;
};

export type DispatchMonitorDriverRow = {
  driverId: string;
  driverName: string;
  activeAssignedCount: number;
  lateCount: number;
  breachCount: number;
  assignedTasks: DispatchRow[];
};

export type DispatchMonitorSnapshot = {
  generatedAtIso: string;
  drivers: DispatchMonitorDriverRow[];
  delayedDriversSection: DispatchRow[];
};

/**
 * Client-side guard: stale caches / leaked rows must not render as tasks.
 * Server already filters; this is defense-in-depth for polling UX.
 */
const CC_ACTIVE_DISPATCH_STATUSES: DispatchStatus[] = ['ASSIGNED'];

/** Defense-in-depth: drop leaked rows before rendering or merging poll results. */
export function sanitizeCcDispatchTasks<T extends DispatchRow>(tasks: T[]): T[] {
  const unique = new Map<string, T>();
  for (const t of tasks) {
    if (!t.driverId?.trim() || !t.customerId?.trim()) continue;
    if (!CC_ACTIVE_DISPATCH_STATUSES.includes(t.status)) continue;
    unique.set(t.id, t);
  }
  return [...unique.values()];
}

/** Reconcile monitor aggregates after row sanitization (counts vs tasks). */
export function sanitizeDispatchMonitorSnapshot(
  snap: DispatchMonitorSnapshot,
): DispatchMonitorSnapshot {
  const delayedDriversSection = sanitizeCcDispatchTasks(
    snap.delayedDriversSection,
  );

  const drivers = snap.drivers
    .map((d) => {
      const assignedTasks = sanitizeCcDispatchTasks(d.assignedTasks).filter(
        (task) => task.driverId === d.driverId,
      );
      const isolatedAssignedTasks = [...assignedTasks];
      console.log('ROW TASKS', d.driverId, isolatedAssignedTasks.length);
      let lateCount = 0;
      let breachCount = 0;
      for (const t of isolatedAssignedTasks) {
        if (t.status !== 'ASSIGNED') continue;
        if (t.slaTone === 'LATE') lateCount += 1;
        if (t.slaTone === 'BREACH') breachCount += 1;
      }
      return {
        ...d,
        assignedTasks: isolatedAssignedTasks,
        activeAssignedCount: isolatedAssignedTasks.length,
        lateCount,
        breachCount,
      };
    })
    .filter((d) => d.activeAssignedCount > 0);

  return {
    ...snap,
    drivers,
    delayedDriversSection,
  };
}

// ─── Endpoints ───────────────────────────────────────────────────────

export async function listActiveDispatches(
  token: string | null,
  opts?: { limit?: number; signal?: AbortSignal },
): Promise<DispatchSnapshot> {
  const qs = opts?.limit ? `?limit=${opts.limit}` : '';
  const raw = await apiJson<DispatchSnapshot>(
    `/api/call-center/dispatch/active${qs}`,
    {
      token,
      signal: opts?.signal,
      headers: CC_DASHBOARD_FETCH_HEADERS,
    },
  );
  const rowsIn = Array.isArray(raw.rows) ? raw.rows : [];
  const out: DispatchSnapshot = {
    generatedAtIso: raw.generatedAtIso,
    rows: sanitizeCcDispatchTasks(rowsIn),
  };
  console.log('DASHBOARD API RESPONSE', out);
  return out;
}

export async function fetchDispatchMonitor(
  token: string | null,
  opts?: { signal?: AbortSignal },
): Promise<DispatchMonitorSnapshot> {
  const raw = await apiJson<DispatchMonitorSnapshot>(
    `/api/call-center/dispatch/monitor`,
    {
      token,
      signal: opts?.signal,
      headers: CC_DASHBOARD_FETCH_HEADERS,
    },
  );
  const safe: DispatchMonitorSnapshot = {
    generatedAtIso: raw.generatedAtIso,
    drivers: Array.isArray(raw.drivers) ? raw.drivers : [],
    delayedDriversSection: Array.isArray(raw.delayedDriversSection)
      ? raw.delayedDriversSection
      : [],
  };
  const sanitized = sanitizeDispatchMonitorSnapshot(safe);
  console.log('DASHBOARD API RESPONSE', sanitized);
  return sanitized;
}

/**
 * V19.x — Authoritative driver roster for the dispatch picker. Use
 * this in BOTH the Create Dispatch dialog AND the Reassign dialog.
 * Do NOT derive a driver list from active-dispatch rows: that subset
 * is empty when no dispatch exists, and stale even when one does.
 */
export async function listCcDrivers(
  token: string | null,
  opts?: { signal?: AbortSignal },
): Promise<CcDriverRow[]> {
  const data = await apiJson<CcDriverRow[]>(`/api/call-center/drivers`, {
    token,
    signal: opts?.signal,
    headers: CC_DASHBOARD_FETCH_HEADERS,
  });
  const rows = Array.isArray(data) ? data : [];
  console.log('DASHBOARD API RESPONSE', rows);
  return rows;
}

export function createDispatch(
  token: string | null,
  input: CreateDispatchInput,
): Promise<DispatchRow> {
  return apiJson<DispatchRow>(`/api/call-center/dispatch`, {
    token,
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function reassignDispatch(
  token: string | null,
  dispatchId: string,
  input: ReassignDispatchInput,
): Promise<DispatchRow> {
  return apiJson<DispatchRow>(
    `/api/call-center/dispatch/${dispatchId}/reassign`,
    {
      token,
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function blockCustomer(
  token: string | null,
  customerId: string,
  input: BlockCustomerInput,
): Promise<CustomerBlockSnapshot> {
  return apiJson<CustomerBlockSnapshot>(
    `/api/customers/${customerId}/block`,
    {
      token,
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function unblockCustomer(
  token: string | null,
  customerId: string,
  input: UnblockCustomerInput,
): Promise<CustomerBlockSnapshot> {
  return apiJson<CustomerBlockSnapshot>(
    `/api/customers/${customerId}/unblock`,
    {
      token,
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}
