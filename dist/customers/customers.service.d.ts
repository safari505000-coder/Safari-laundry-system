import { SafariRole } from "@prisma/client";
import type { CustomerCoreRow } from './customer-core.service';
import { DebtService } from '../finance/services/debt.service';
import { SubscriptionService } from '../finance/services/subscription.service';
import { CustomerCoreService } from './customer-core.service';
import type { CustomerInternalDTO } from './dto/customer-access.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
export declare class CustomersService {
    private readonly core;
    private readonly debt;
    private readonly subscription;
    constructor(core: CustomerCoreService, debt: DebtService, subscription: SubscriptionService);
    list(query?: string, role?: SafariRole | string): Promise<CustomerInternalDTO[]>;
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
    getProfileWithFinancials(customerId: string, role?: SafariRole | string): Promise<CustomerInternalDTO>;
    private canSeeFinancials;
    private toPublicDto;
    private toFinancialDto;
}
