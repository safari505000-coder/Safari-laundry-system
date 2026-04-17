import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCustomerDto } from './dto/update-customer.dto';
export declare const customerCoreSelect: {
    id: true;
    phone: true;
    phone2: true;
    displayName: true;
    address: true;
    addressArea: true;
    addressBlock: true;
    addressStreet: true;
    addressAvenue: true;
    addressHouse: true;
    motherContact: true;
    wifeContact: true;
    sonContact: true;
    createdAt: true;
    updatedAt: true;
};
export type CustomerCoreRow = Prisma.CustomerGetPayload<{
    select: typeof customerCoreSelect;
}>;
export declare class CustomerCoreService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    list(query?: string): Promise<CustomerCoreRow[]>;
    listByPhonePriority(query: string): Promise<CustomerCoreRow[]>;
    getById(id: string): Promise<CustomerCoreRow | null>;
    update(id: string, dto: UpdateCustomerDto): Promise<CustomerCoreRow>;
}
