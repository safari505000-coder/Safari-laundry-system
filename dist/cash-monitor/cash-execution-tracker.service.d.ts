import { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from '../prisma/prisma.service';
import { CashMonitorService } from './cash-monitor.service';
import { CashExecutionAction, CashExecutionBlockDto } from './dto/cash-execution.dto';
export declare class CashExecutionTrackerService implements OnModuleInit, OnModuleDestroy {
    private readonly monitor;
    private readonly prisma;
    private readonly logger;
    private lastAtRisk;
    private unsubscribe;
    constructor(monitor: CashMonitorService, prisma: PrismaService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    recordAction(input: {
        driverId: string;
        action: CashExecutionAction;
        note?: string;
        actor: string | null;
        alertType?: string;
        allowedDriverIds?: ReadonlySet<string>;
    }): Promise<CashExecutionBlockDto>;
    getExecutionBlock(driverId: string): Promise<CashExecutionBlockDto>;
    lateCountLast7Days(driverId: string): Promise<number>;
    lateCountsByDriver(driverIds: readonly string[]): Promise<Map<string, number>>;
    private ingestSnapshot;
    private flagCounts;
}
