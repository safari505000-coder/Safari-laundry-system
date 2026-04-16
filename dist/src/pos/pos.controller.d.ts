import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { PosCheckoutBundleDto } from '../orders/dto/pos-checkout-bundle.dto';
import { PosCheckoutDto } from '../orders/dto/pos-checkout.dto';
import { OrdersService } from '../orders/orders.service';
import { PosCreateCustomerDto } from './dto/pos-create-customer.dto';
import { PosService } from './pos.service';
export declare class PosController {
    private readonly posService;
    private readonly ordersService;
    constructor(posService: PosService, ordersService: OrdersService);
    searchCustomers(q: string): Promise<{
        id: string;
        createdAt: Date;
        phone: string;
        wallet: {
            balance: import("@prisma/client-runtime-utils").Decimal;
            debt: import("@prisma/client-runtime-utils").Decimal;
        } | null;
        phone2: string | null;
        motherContact: string | null;
        wifeContact: string | null;
        sonContact: string | null;
        displayName: string | null;
        address: string | null;
        addressArea: string | null;
        addressBlock: string | null;
        addressStreet: string | null;
        addressAvenue: string | null;
        addressHouse: string | null;
    }[]>;
    createCustomer(dto: PosCreateCustomerDto): Promise<{
        id: string;
        createdAt: Date;
        phone: string;
        wallet: {
            balance: import("@prisma/client-runtime-utils").Decimal;
            debt: import("@prisma/client-runtime-utils").Decimal;
        } | null;
        phone2: string | null;
        motherContact: string | null;
        wifeContact: string | null;
        sonContact: string | null;
        displayName: string | null;
        address: string | null;
        addressArea: string | null;
        addressBlock: string | null;
        addressStreet: string | null;
        addressAvenue: string | null;
        addressHouse: string | null;
    }>;
    getCustomerBilling(customerId: string): Promise<{
        subscriptionActive: boolean;
        planType: string | null;
        remainingBalance: string;
        debt: string;
        lastSubscriptionAt: string | null;
    }>;
    posCheckout(dto: PosCheckoutDto, user: JwtUser): Promise<import("../orders/orders.service").PosCheckoutOrderDetail>;
    posCheckoutBundle(dto: PosCheckoutBundleDto, user: JwtUser): Promise<import("../orders/orders.service").PosCheckoutBundleResult>;
}
