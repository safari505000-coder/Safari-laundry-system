import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { CommissionPayoutsService } from './commission-payouts.service';
import { ListCommissionPayoutsDto } from './dto/list-commission-payouts.dto';
export declare class CommissionPayoutsController {
    private readonly service;
    constructor(service: CommissionPayoutsService);
    list(q: ListCommissionPayoutsDto, user: JwtUser): Promise<{
        rows: ({
            rule: {
                id: string;
                name: string;
                mode: import("@prisma/client").$Enums.CommissionMode;
                percentage: import("@prisma/client-runtime-utils").Decimal;
                calculationBase: import("@prisma/client").$Enums.CommissionCalculationBase;
                payoutTiming: import("@prisma/client").$Enums.CommissionPayoutTiming;
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
            id: string;
            createdAt: Date;
            updatedAt: Date;
            amount: import("@prisma/client-runtime-utils").Decimal;
            status: import("@prisma/client").$Enums.CommissionPayoutStatus;
            cancelledAt: Date | null;
            ruleId: string;
            earnerUserId: string;
            mode: import("@prisma/client").$Enums.CommissionMode;
            basisAmount: import("@prisma/client-runtime-utils").Decimal;
            percentage: import("@prisma/client-runtime-utils").Decimal;
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
