/**
 * Call Center Control Tower — unified AR + dispatch intelligence API.
 *
 * Backend: `GET /api/call-center/control-tower` (CALL_CENTER,
 * CALL_CENTER_SUPERVISOR, OWNER). IDs are UUID strings.
 */
import { apiJson } from '@/lib/api';

const CONTROL_TOWER_FETCH_HEADERS: HeadersInit = {
  'Cache-Control': 'no-cache',
};

export type ControlTowerPreset = 'all' | 'today' | 'week' | 'month';

export type ControlTowerSlaStatus = 'OK' | 'LATE' | 'ESCALATED' | 'BREACHED';

export type ControlTowerRiskLevel = 'NORMAL' | 'LATE' | 'RISK';

export type ControlTowerQueryFilters = {
  preset?: ControlTowerPreset;
  driverId?: string;
  topLimit?: number;
};

export type ControlTowerKpis = {
  totalDue: number;
  customersWithDebt: number;
  lateCustomers: number;
  riskCustomers: number;
  activeDispatches: number;
  slaBreached: number;
};

export type ControlTowerDriverWorkload = {
  driverId: string;
  name: string;
  assigned: number;
  inProgress: number;
  late: number;
};

export type ControlTowerRow = {
  customerId: string;
  customerName: string;
  phone: string;
  driverName: string;
  totalDue: number;
  invoicesCount: number;
  daysLate: number;
  riskLevel: ControlTowerRiskLevel;
  hasActiveDispatch: boolean;
  dispatchStatus: 'ASSIGNED' | 'IN_PROGRESS' | null;
  slaStatus: ControlTowerSlaStatus;
  blocked: boolean;
};

export type ControlTowerMeta = {
  preset: ControlTowerPreset;
  generatedAt: string;
  windowFromIso?: string | null;
  windowToIso?: string | null;
};

export type ControlTowerResponse = {
  kpis: ControlTowerKpis;
  drivers: ControlTowerDriverWorkload[];
  rows: ControlTowerRow[];
  meta: ControlTowerMeta;
};

function buildQs(q: ControlTowerQueryFilters): string {
  const qs = new URLSearchParams();
  if (q.preset) qs.set('preset', q.preset);
  if (q.driverId) qs.set('driverId', q.driverId);
  if (typeof q.topLimit === 'number' && Number.isFinite(q.topLimit)) {
    qs.set('topLimit', String(q.topLimit));
  }
  const out = qs.toString();
  return out ? `?${out}` : '';
}

export async function getControlTowerSnapshot(
  token: string | null,
  query: ControlTowerQueryFilters,
  opts?: { signal?: AbortSignal },
): Promise<ControlTowerResponse> {
  const data = await apiJson<ControlTowerResponse>(
    `/api/call-center/control-tower${buildQs(query)}`,
    {
      token,
      signal: opts?.signal,
      headers: CONTROL_TOWER_FETCH_HEADERS,
    },
  );
  console.log('DASHBOARD API RESPONSE', data);
  return data;
}
