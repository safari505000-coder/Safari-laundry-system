import type { CustomerCoreRow } from '../customer-core.service';
import type { DebtService } from '../../finance/services/debt.service';
import type { SubscriptionService } from '../../finance/services/subscription.service';
export type CustomerPublicDTO = {
    customer: CustomerCoreRow;
};
export type CustomerFinancialDTO = CustomerPublicDTO & {
    debt: Awaited<ReturnType<DebtService['getCustomerDebtSnapshot']>>;
    subscription: Awaited<ReturnType<SubscriptionService['getCustomerSubscriptionSnapshot']>>;
};
export type CustomerInternalDTO = CustomerPublicDTO | CustomerFinancialDTO;
