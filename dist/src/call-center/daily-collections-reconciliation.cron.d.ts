import { PrismaService } from '../prisma/prisma.service';
import { CallCenterService } from './call-center.service';
export declare class DailyCollectionsReconciliationCronService {
    private readonly prisma;
    private readonly callCenter;
    private readonly logger;
    constructor(prisma: PrismaService, callCenter: CallCenterService);
    handleCron(): Promise<void>;
    latestSnapshot(): Promise<{
        status: 'DRIFT' | 'MATCH';
        recordedAtIso: string;
        dayIsoLocal: string;
    } | null>;
}
