import { CustomerCollectionStatusKind } from "@prisma/client";
export declare class OutstandingQueryDto {
    from?: string;
    to?: string;
    branchId?: string;
    driverId?: string;
    customerId?: string;
    status?: CustomerCollectionStatusKind;
    search?: string;
    blocked?: boolean;
}
