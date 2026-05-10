/**
 * V21 Canonical Banking Core subscription contract.
 *
 * New financial reads must use this contract for subscription consumption and
 * remaining-balance projections. The implementation remains the existing
 * audited projection helper.
 */
export {
  computeSubscriptionConsumption,
  type SubscriptionConsumptionInput,
  type SubscriptionConsumptionResult,
} from '../customers/subscription-consumption.projection';
