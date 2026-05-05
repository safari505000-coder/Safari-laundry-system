import { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ReadinessService } from '../health/readiness.service';
import { MetricsService } from '../observability/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { OwnerDashboardCacheResponseDto, OwnerDashboardResponseDto } from './dto/owner-dashboard-response.dto';
export declare class OwnerDashboardService implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly metrics;
    private readonly readiness;
    private readonly logger;
    private redis;
    constructor(prisma: PrismaService, metrics: MetricsService, readiness: ReadinessService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    getCachedDashboard(): Promise<OwnerDashboardCacheResponseDto>;
    refreshDashboard(): Promise<OwnerDashboardResponseDto>;
    private writeCache;
    private parseCachedDashboard;
    private businessSnapshot;
    private queueSnapshot;
    private systemStatus;
    private alertMessage;
    private money;
    private kuwaitMonthStartUtc;
    private loadingCache;
}
