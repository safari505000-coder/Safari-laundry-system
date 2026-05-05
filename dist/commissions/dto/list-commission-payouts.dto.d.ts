import { CommissionPayoutStatus } from "@prisma/client";
export declare class ListCommissionPayoutsDto {
    from: string;
    to: string;
    earnerUserId?: string;
    status?: CommissionPayoutStatus;
}
