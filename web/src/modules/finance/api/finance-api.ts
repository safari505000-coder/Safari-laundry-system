/**
 * V20.7 — Phase 2 finance domain API surface.
 *
 * Curates the finance-related fetchers + types from the giant
 * `web/src/lib/api.ts` god-file into a single discoverable surface
 * for `modules/finance/`. This is an additive **re-export** layer:
 *
 *   • Zero behaviour change.
 *   • Zero new HTTP endpoints.
 *   • Pure type forwarding so the legacy `lib/api.ts` continues to
 *     work for surfaces not yet migrated.
 *
 * As legacy pages migrate to module APIs, the underlying fetchers
 * can move out of `lib/api.ts` and into this file (or a sibling) —
 * the import path here is stable.
 */

export {
  apiJson,
  apiFetch,
  ApiError,
  type Customer360ResponseInternal,
  type Customer360ResponseSanitized,
  type Customer360Statement,
  type Customer360Financials,
  type Customer360SubscriptionRow,
  type Customer360SubscriptionFinancials,
  getCustomer360,
} from '../../../lib/api';
