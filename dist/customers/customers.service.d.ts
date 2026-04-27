import type { CustomerCoreRow } from './customer-core.service';
import { DebtService } from '../finance/services/debt.service';
import { SubscriptionService } from '../finance/services/subscription.service';
import { CustomerCoreService } from './customer-core.service';
import { UpdateCustomerDto } from './dto/update-customer.dto';
export declare class CustomersService {
    private readonly core;
    private readonly debt;
    private readonly subscription;
    constructor(core: CustomerCoreService, debt: DebtService, subscription: SubscriptionService);
    list(query?: string): Promise<Array<{
        customer: CustomerCoreRow;
        debt: Awaited<ReturnType<DebtService['getCustomerDebtSnapshot']>>;
        subscription: Awaited<ReturnType<SubscriptionService['getCustomerSubscriptionSnapshot']>>;
    }>>;
    update(id: string, dto: UpdateCustomerDto): Promise<CustomerCoreRow>;
    resolveIncomingPhone(raw: string): Promise<{
        customer: CustomerCoreRow | null;
        ambiguous: boolean;
        searchHint: string;
    }>;
    createQuick(dto: {
        displayName: string;
        phone: string;
    }): Promise<CustomerCoreRow>;
    getProfileWithFinancials(customerId: string): Promise<{
        customer: CustomerCoreRow;
        debt: Awaited<ReturnType<DebtService['getCustomerDebtSnapshot']>>;
        subscription: Awaited<ReturnType<SubscriptionService['getCustomerSubscriptionSnapshot']>>;
    }>;
}
