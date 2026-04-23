import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from './inventory.service';
export declare class LowStockCronService {
    private readonly prisma;
    private readonly inventory;
    private readonly logger;
    constructor(prisma: PrismaService, inventory: InventoryService);
    handleCron(): Promise<void>;
    latestSnapshot(): Promise<{
        hadAlerts: boolean;
        recordedAtIso: string;
        report: Awaited<ReturnType<InventoryService['lowStock']>>;
    } | null>;
}
