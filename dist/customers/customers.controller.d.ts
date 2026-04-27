import { CreateCustomerQuickDto } from './dto/create-customer-quick.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomersService } from './customers.service';
export declare class CustomersController {
    private readonly customersService;
    constructor(customersService: CustomersService);
    list(q?: string): Promise<{
        customer: import("./customer-core.service").CustomerCoreRow;
        debt: Awaited<ReturnType<import("../finance/services/debt.service").DebtService["getCustomerDebtSnapshot"]>>;
        subscription: Awaited<ReturnType<import("../finance/services/subscription.service").SubscriptionService["getCustomerSubscriptionSnapshot"]>>;
    }[]>;
    resolveIncomingPhone(phone?: string): Promise<{
        customer: import("./customer-core.service").CustomerCoreRow | null;
        ambiguous: boolean;
        searchHint: string;
    }>;
    createQuick(dto: CreateCustomerQuickDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        phone: string;
        address: string | null;
        phone2: string | null;
        motherContact: string | null;
        wifeContact: string | null;
        sonContact: string | null;
        displayName: string | null;
        addressArea: string | null;
        addressBlock: string | null;
        addressStreet: string | null;
        addressAvenue: string | null;
        addressHouse: string | null;
    }>;
    getProfile(id: string): Promise<{
        customer: import("./customer-core.service").CustomerCoreRow;
        debt: Awaited<ReturnType<import("../finance/services/debt.service").DebtService["getCustomerDebtSnapshot"]>>;
        subscription: Awaited<ReturnType<import("../finance/services/subscription.service").SubscriptionService["getCustomerSubscriptionSnapshot"]>>;
    }>;
    update(id: string, dto: UpdateCustomerDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        phone: string;
        address: string | null;
        phone2: string | null;
        motherContact: string | null;
        wifeContact: string | null;
        sonContact: string | null;
        displayName: string | null;
        addressArea: string | null;
        addressBlock: string | null;
        addressStreet: string | null;
        addressAvenue: string | null;
        addressHouse: string | null;
    }>;
}
