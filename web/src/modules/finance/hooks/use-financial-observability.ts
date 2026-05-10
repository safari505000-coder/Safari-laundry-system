import { keyOf, useFinancialQuery } from '../state/financial-cache';
import {
  fetchObservabilityDrift,
  fetchObservabilityOverview,
  fetchObservabilityPerformance,
  fetchObservabilityReconciliation,
  type ObservabilityDrift,
  type ObservabilityOverview,
  type ObservabilityPerformance,
  type ObservabilityReconciliation,
} from '../api/observability-api';

/**
 * V20.6 — Phase 6 hooks for the financial observability surface.
 *
 * One hook per endpoint, each backed by the financial cache so
 * concurrent KPI surfaces (topbar pill, dashboard, incident response
 * page) share a single in-flight request and a single normalized
 * cache entry.
 *
 * Default stale window: 30s for `overview`, 60s for the heavier
 * endpoints. Tune per-call if needed.
 */

const KEY_NS = 'finance:observability';

export function useObservabilityOverview(
  token: string | null,
  windowHours = 24,
  staleMs = 30000,
) {
  const queryKey = keyOf([KEY_NS, 'overview', windowHours, token ? 'auth' : 'noauth']);
  return useFinancialQuery<ObservabilityOverview>(
    queryKey,
    async () => {
      if (!token) throw new Error('No auth token');
      return fetchObservabilityOverview(token, windowHours);
    },
    staleMs,
  );
}

export function useObservabilityDrift(
  token: string | null,
  windowHours = 24,
  staleMs = 60000,
) {
  const queryKey = keyOf([KEY_NS, 'drift', windowHours, token ? 'auth' : 'noauth']);
  return useFinancialQuery<ObservabilityDrift>(
    queryKey,
    async () => {
      if (!token) throw new Error('No auth token');
      return fetchObservabilityDrift(token, windowHours);
    },
    staleMs,
  );
}

export function useObservabilityReconciliation(
  token: string | null,
  staleMs = 60000,
) {
  const queryKey = keyOf([KEY_NS, 'reconciliation', token ? 'auth' : 'noauth']);
  return useFinancialQuery<ObservabilityReconciliation>(
    queryKey,
    async () => {
      if (!token) throw new Error('No auth token');
      return fetchObservabilityReconciliation(token);
    },
    staleMs,
  );
}

export function useObservabilityPerformance(
  token: string | null,
  windowHours = 24,
  staleMs = 60000,
) {
  const queryKey = keyOf([KEY_NS, 'performance', windowHours, token ? 'auth' : 'noauth']);
  return useFinancialQuery<ObservabilityPerformance>(
    queryKey,
    async () => {
      if (!token) throw new Error('No auth token');
      return fetchObservabilityPerformance(token, windowHours);
    },
    staleMs,
  );
}
