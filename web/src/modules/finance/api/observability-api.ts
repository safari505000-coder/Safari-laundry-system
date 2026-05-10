import { apiJson } from '../../../lib/api';

/**
 * V20.6 — Phase 6A typed client for the
 * `/api/finance/observability/*` HTTP surface added in Phase 3.
 *
 * Mirrors the server DTOs verbatim so the React consumer reads
 * SERVER-CANONICAL fields directly. Never re-derive these on the
 * client.
 */

export type ObservabilitySeverity = 'HEALTHY' | 'DEGRADED' | 'WARNING' | 'CRITICAL';

export type ObservabilitySection = {
  key: string;
  label: string;
  status: ObservabilitySeverity;
  metric: number | string;
  detail?: string;
};

export type ObservabilityOverview = {
  generatedAt: string;
  windowHours: number;
  healthScore: number;
  status: ObservabilitySeverity;
  sections: ObservabilitySection[];
};

export type ObservabilityDrift = {
  generatedAt: string;
  reconciliationOk: boolean;
  drift: Array<{
    invariant: string;
    expectedKd: string;
    actualKd: string;
    deltaKd: string;
    detail?: string;
  }>;
  periodViolations: number;
  recentViolations: Array<{
    id: string;
    writerName: string;
    sourceRef: string | null;
    attemptedAt: string;
  }>;
};

export type ObservabilityReconciliation = {
  generatedAt: string;
  durationMs: number;
  ok: boolean;
  driftCount: number;
  rows: Array<{
    invariant: string;
    expectedKd: string;
    actualKd: string;
    deltaKd: string;
    ok: boolean;
    detail?: string;
  }>;
};

export type ObservabilityPerformance = {
  generatedAt: string;
  windowHours: number;
  snapshot: {
    rows: number;
    stalePctOver10min: number;
    stalePctOver1hour: number;
    oldestLagMinutes: number;
  };
  journalFailures: {
    total: number;
    last24h: number;
    distinctCustomers24h: number;
  };
  fraudAlerts: {
    open: number;
    last24h: number;
    bySeverity: Record<string, number>;
  };
  promises: {
    active: number;
    brokenLast24h: number;
    keptLast24h: number;
  };
  collections: {
    escalated: number;
    overdueSla: number;
  };
};

const BASE = '/api/finance/observability';

export function fetchObservabilityOverview(
  token: string,
  windowHours = 24,
): Promise<ObservabilityOverview> {
  return apiJson<ObservabilityOverview>(`${BASE}/overview?windowHours=${windowHours}`, {
    token,
  });
}

export function fetchObservabilityDrift(
  token: string,
  windowHours = 24,
): Promise<ObservabilityDrift> {
  return apiJson<ObservabilityDrift>(`${BASE}/drift?windowHours=${windowHours}`, {
    token,
  });
}

export function fetchObservabilityReconciliation(
  token: string,
): Promise<ObservabilityReconciliation> {
  return apiJson<ObservabilityReconciliation>(`${BASE}/reconciliation`, { token });
}

export function fetchObservabilityPerformance(
  token: string,
  windowHours = 24,
): Promise<ObservabilityPerformance> {
  return apiJson<ObservabilityPerformance>(`${BASE}/performance?windowHours=${windowHours}`, {
    token,
  });
}
