import type { JwtUser } from '../auth/decorators/current-user.decorator';
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
    posCheckout(dto: PosCheckoutDto, user: JwtUser): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.OrderStatus;
        serviceType: import("@prisma/client").$Enums.ServiceType;
        totalPrice: import("@prisma/client-runtime-utils").Decimal;
        cashStatus: import("@prisma/client").$Enums.CashStatus;
        invoiceNumber: string | null;
        notes: string | null;
        posPaymentMethod: import("@prisma/client").$Enums.PosPaymentMethod | null;
        completedAt: Date | null;
        walletSettledAt: Date | null;
        customer: {
            id: string;
            phone: string;
            phone2: string | null;
            displayName: string | null;
            address: string | null;
        };
        driver: {
            id: string;
            username: string;
            fullName: string;
            employeeId: string | null;
            jobTitle: string | null;
            phone: string | null;
            safariRole: import("@prisma/client").$Enums.SafariRole;
        } | null;
        lineItems: {
            id: string;
            label: string | null;
            quantity: import("@prisma/client-runtime-utils").Decimal;
            unitPrice: import("@prisma/client-runtime-utils").Decimal;
        }[];
    }>;
}
