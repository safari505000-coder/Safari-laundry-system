import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { PosCreateCustomerDto } from './dto/pos-create-customer.dto';
export declare class PosService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getCustomerBillingProfile(customerId: string): Promise<{
        subscriptionActive: boolean;
        planType: string | null;
        remainingBalance: string;
        debt: string;
        lastSubscriptionAt: string | null;
    }>;
    searchCustomers(query: string): Promise<{
        wallet: {
            balance: Prisma.Decimal;
            debt: Prisma.Decimal;
        } | null;
        id: string;
        createdAt: Date;
        phone: string;
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
        wallet: {
            balance: Prisma.Decimal;
            debt: Prisma.Decimal;
        } | null;
        id: string;
        createdAt: Date;
        phone: string;
        phone2: string | null;
        displayName: string | null;
        address: string | null;
        addressArea: string | null;
        addressBlock: string | null;
        addressStreet: string | null;
        addressAvenue: string | null;
        addressHouse: string | null;
    }>;
}
