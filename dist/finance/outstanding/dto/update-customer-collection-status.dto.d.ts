import { CustomerCollectionStatusKind } from "@prisma/client";
export declare class UpdateCustomerCollectionStatusDto {
    status: CustomerCollectionStatusKind;
    blocked: boolean;
    note?: string;
}
export declare class CustomerCollectionStatusDto {
    customerId: string;
    status: CustomerCollectionStatusKind;
    blocked: boolean;
    note?: string | null;
    updatedAt: string;
    updatedById?: string | null;
}
