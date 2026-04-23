import { PrismaService } from '../prisma/prisma.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { CommissionEarningService } from './commission-earning.service';
export declare class CommissionEarningCron {
    private readonly prisma;
    private readonly earning;
    private readonly settings;
    private readonly logger;
    private static readonly SCAN_MINUTES;
    constructor(prisma: PrismaService, earning: CommissionEarningService, settings: SystemSettingsService);
    scan(): Promise<void>;
    scanEndOfMonth(): Promise<void>;
    private scanCompletedOrders;
    private scanDebtPayments;
    private releaseAfterCollection;
}
