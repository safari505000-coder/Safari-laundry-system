import { DepositStatus } from "@prisma/client";
export declare class DepositsListQueryDto {
    status?: DepositStatus;
    driverId?: string;
    driverName?: string;
}
