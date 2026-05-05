import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from './metrics.service';
export declare class RevenueMetricsCollector {
    private readonly prisma;
    private readonly metrics;
    private readonly logger;
    constructor(prisma: PrismaService, metrics: MetricsService);
    collect(): Promise<void>;
}
