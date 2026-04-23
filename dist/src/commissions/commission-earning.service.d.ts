import { Prisma } from '@prisma/client';
import { PaymentMethodFeesService } from '../payment-method-fees/payment-method-fees.service';
import { PrismaService } from '../prisma/prisma.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
export declare class CommissionEarningService {
    private readonly prisma;
    private readonly systemSettings;
    private readonly paymentMethodFees;
    private readonly logger;
    constructor(prisma: PrismaService, systemSettings: SystemSettingsService, paymentMethodFees: PaymentMethodFeesService);
    earnForOrder(orderId: string, tx?: Prisma.TransactionClient): Promise<void>;
    earnForDebtPayment(debtEntryId: string, tx?: Prisma.TransactionClient): Promise<void>;
    releaseAfterCollectionForOrder(orderId: string, tx?: Prisma.TransactionClient): Promise<number>;
    releaseEndOfMonth(asOf: Date): Promise<number>;
    cancelForOrder(orderId: string, reason: string): Promise<number>;
    private pickActiveRules;
    private computeBasisForSale;
}
