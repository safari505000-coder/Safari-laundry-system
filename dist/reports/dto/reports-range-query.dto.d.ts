import { PosPaymentMethod } from "@prisma/client";
export declare class ReportsRangeQueryDto {
    from: string;
    to: string;
    driverId?: string;
    posPaymentMethod?: PosPaymentMethod;
    branchId?: string;
}
