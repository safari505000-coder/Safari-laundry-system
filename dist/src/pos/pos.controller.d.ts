import { PosCreateCustomerDto } from './dto/pos-create-customer.dto';
import { PosService } from './pos.service';
export declare class PosController {
    private readonly posService;
    constructor(posService: PosService);
    searchCustomers(q: string): Promise<{
        id: string;
        createdAt: Date;
        wallet: {
            balance: import("@prisma/client-runtime-utils").Decimal;
            debt: import("@prisma/client-runtime-utils").Decimal;
        } | null;
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
        id: string;
        createdAt: Date;
        wallet: {
            balance: import("@prisma/client-runtime-utils").Decimal;
            debt: import("@prisma/client-runtime-utils").Decimal;
        } | null;
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
