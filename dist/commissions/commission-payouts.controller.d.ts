import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { CommissionPayoutsService } from './commission-payouts.service';
import { ListCommissionPayoutsDto } from './dto/list-commission-payouts.dto';
export declare class CommissionPayoutsController {
    private readonly service;
    constructor(service: CommissionPayoutsService);
    list(q: ListCommissionPayoutsDto, user: JwtUser): Promise<{
        rows: ({
            rule: {
                name: string;
                id: string;
                mode: import(".prisma/client").$Enums.CommissionMode;
                percentage: import("@prisma/client-runtime-utils/dist").Decimal;
                calculationBase: import(".prisma/client").$Enums.CommissionCalculationBase;
                payoutTiming: import(".prisma/client").$Enums.CommissionPayoutTiming;
            };
            earner: {
                id: string;
                username: string;
                fullName: string;
            };
            sourceOrder: {
                id: string;
                invoiceNumber: string | null;
                serialNumber: string | null;
            } | null;
        } & {
            status: import(".prisma/client").$Enums.CommissionPayoutStatus;
            amount: import("@prisma/client-runtime-utils/dist").Decimal;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            mode: import(".prisma/client").$Enums.CommissionMode;
            cancelledAt: Date | null;
            ruleId: string;
            earnerUserId: string;
            basisAmount: import("@prisma/client-runtime-utils/dist").Decimal;
            percentage: import("@prisma/client-runtime-utils/dist").Decimal;
            sourceOrderId: string | null;
            sourceDebtEntryId: string | null;
            payrollId: string | null;
            earnedAt: Date;
            releasedAt: Date | null;
            paidAt: Date | null;
            cancelReason: string | null;
        })[];
        totals: {
            earnerUserId: string;
            pendingKd: string;
            releasedKd: string;
            paidKd: string;
            cancelledKd: string;
        }[];
    }>;
}
