import { CreateCustomerQuickDto } from './dto/create-customer-quick.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { BlockCustomerDto, UnblockCustomerDto } from './dto/block-customer.dto';
import { CustomersService } from './customers.service';
import { Customer360Service } from './customer-360.service';
import { CustomerBlockingService } from '../common/services/customer-blocking.service';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
export declare class CustomersController {
    private readonly customersService;
    private readonly customer360;
    private readonly customerBlocking;
    constructor(customersService: CustomersService, customer360: Customer360Service, customerBlocking: CustomerBlockingService);
    list(q: string | undefined, user: JwtUser): Promise<import("./dto/customer-access.dto").CustomerInternalDTO[]>;
    resolveIncomingPhone(phone?: string): Promise<{
        customer: import("./customer-core.service").CustomerCoreRow | null;
        ambiguous: boolean;
        searchHint: string;
    }>;
    createQuick(dto: CreateCustomerQuickDto): Promise<{
        id: string;
        phone: string;
        createdAt: Date;
        updatedAt: Date;
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
    getCustomer360(customerId: string, user: JwtUser): Promise<import("./customer-360.service").Customer360ResponseDto>;
    getProfile(id: string, user: JwtUser): Promise<import("./dto/customer-access.dto").CustomerInternalDTO>;
    update(id: string, dto: UpdateCustomerDto): Promise<{
        id: string;
        phone: string;
        createdAt: Date;
        updatedAt: Date;
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
    block(id: string, dto: BlockCustomerDto, user: JwtUser): Promise<import("../common/services/customer-blocking.service").CustomerBlockSnapshot>;
    unblock(id: string, dto: UnblockCustomerDto, user: JwtUser): Promise<import("../common/services/customer-blocking.service").CustomerBlockSnapshot>;
}
