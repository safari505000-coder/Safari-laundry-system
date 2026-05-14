import type { CustomerCoreRow } from '../customer-core.service';
import type { DebtService } from '../../finance/services/debt.service';
import type { SubscriptionService } from '../../finance/services/subscription.service';

/**
 * بيانات العميل العامة — تحتوي على البيانات الأساسية فقط دون المعلومات المالية.
 * Public customer DTO — contains only the core customer row, no financial data.
 */
export type CustomerPublicDTO = {
  customer: CustomerCoreRow;
};

/**
 * بيانات العميل المالية — تمتد من العامة وتضيف لقطة الدين والاشتراك.
 * Financial customer DTO — extends CustomerPublicDTO with debt and subscription snapshots.
 */
export type CustomerFinancialDTO = CustomerPublicDTO & {
  debt: Awaited<ReturnType<DebtService['getCustomerDebtSnapshot']>>;
  subscription: Awaited<ReturnType<SubscriptionService['getCustomerSubscriptionSnapshot']>>;
};

/**
 * بيانات العميل الداخلية — اتحاد العامة والمالية لاستخدام طبقة الخدمة.
 * Internal customer DTO — union of public and financial views for internal service use.
 */
export type CustomerInternalDTO = CustomerPublicDTO | CustomerFinancialDTO;
