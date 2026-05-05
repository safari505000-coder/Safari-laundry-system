import { PrismaService } from '../prisma/prisma.service';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { CustomerBlockingService } from '../common/services/customer-blocking.service';
import type { Customer360InternalDto, Customer360SanitizedDto } from './customer-360.types';
export type Customer360ResponseDto = Customer360InternalDto | Customer360SanitizedDto;
export declare class Customer360Service {
    private readonly prisma;
    private readonly customerBlocking;
    constructor(prisma: PrismaService, customerBlocking: CustomerBlockingService);
    get360(customerId: string, user: JwtUser): Promise<Customer360ResponseDto>;
    private assertAuthorizedForCustomer;
}
