import { Prisma, SafariRole } from "@prisma/client";
import { PrismaService } from '../prisma/prisma.service';
import { ListCommissionPayoutsDto } from './dto/list-commission-payouts.dto';
export declare class CommissionPayoutsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    list(actorRole: SafariRole, actorUserId: string, dto: ListCommissionPayoutsDto): Promise<{
        rows: ({
            rule: {
                name: string;
                id: string;
                mode: import(".prisma/client").$Enums.CommissionMode;
                percentage: Prisma.Decimal;
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
            amount: Prisma.Decimal;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            mode: import(".prisma/client").$Enums.CommissionMode;
            cancelledAt: Date | null;
            ruleId: string;
            earnerUserId: string;
            basisAmount: Prisma.Decimal;
            percentage: Prisma.Decimal;
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
    sumReleasedForUser(earnerUserId: string, asOf: Date): Promise<{
        sumKd: string;
        payoutIds: string[];
    }>;
    markPaidForPayroll(payoutIds: string[], payrollId: string, tx?: Prisma.TransactionClient): Promise<number>;
    assertAdmin(role: SafariRole): void;
}
