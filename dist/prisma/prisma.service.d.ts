import { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { MetricsService } from '../observability/metrics.service';
declare function guardAppendOnlyDelegate<T extends object>(delegate: T, label: string): T;
export declare class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly metrics?;
    private readonly pool;
    private static readonly logger;
    constructor(metrics?: MetricsService | undefined);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    timedQuery<T>(fn: () => Promise<T>): Promise<T>;
}
export { guardAppendOnlyDelegate };
