/**
 * نقطة الدخول الكانونية لحسابات الاشتراك — إعادة تصدير المشروع المُراجَع
 * V21 Canonical Banking Core subscription contract.
 * New financial reads must use this contract for subscription consumption
 * and remaining-balance projections.
 */
export {
  computeSubscriptionConsumption,
  type SubscriptionConsumptionInput,
  type SubscriptionConsumptionResult,
} from '../customers/subscription-consumption.projection';
