/**
 * V20.6 — Phase 6A finance module barrel.
 *
 * Public surface for `modules/finance`. Importers (sibling modules,
 * pages) MUST go through this file — never reach into nested folders
 * directly. This rule prevents accidental coupling and lets us
 * reshuffle internals freely later.
 */

export * from './components';
export {
  financialCache,
  invalidateFinancial,
  keyOf,
  useFinancialQuery,
  type UseFinancialQueryResult,
} from './state/financial-cache';
export {
  useFinancialMutation,
  type MutationOptions,
  type MutationState,
  type UseFinancialMutationResult,
} from './state/financial-mutation';
export {
  useFinancialRealtime,
  type UseFinancialRealtimeOptions,
} from './state/financial-realtime';
export {
  useRealtimeFinancialFeed,
  type RealtimeChannelId,
  type RealtimeEnvelope,
  type RealtimeFeedState,
  type UseRealtimeFinancialFeedOptions,
} from './state/financial-realtime-feed';

// Typed observability API (V20.6 Phase 3 surface — V20.6 Phase 6 client)
export * from './api/observability-api';

// V20.7 — Phase 2 finance domain API surface
export * from './api/finance-api';
export {
  useObservabilityOverview,
  useObservabilityDrift,
  useObservabilityReconciliation,
  useObservabilityPerformance,
} from './hooks/use-financial-observability';
