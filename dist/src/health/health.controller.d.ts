import { HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';
export declare class HealthController {
    private readonly health;
    private readonly prismaHealth;
    private readonly memory;
    private readonly heapLimitBytes;
    private readonly rssLimitBytes;
    constructor(health: HealthCheckService, prismaHealth: PrismaHealthIndicator, memory: MemoryHealthIndicator);
    check(): Promise<import("@nestjs/terminus").HealthCheckResult<import("@nestjs/terminus").HealthIndicatorResult<string, import("@nestjs/terminus").HealthIndicatorStatus, Record<string, any>> & import("@nestjs/terminus").HealthIndicatorResult<"memory_rss"> & import("@nestjs/terminus").HealthIndicatorResult<"memory_heap"> & import("@nestjs/terminus").HealthIndicatorResult, Partial<import("@nestjs/terminus").HealthIndicatorResult<string, import("@nestjs/terminus").HealthIndicatorStatus, Record<string, any>> & import("@nestjs/terminus").HealthIndicatorResult<"memory_rss"> & import("@nestjs/terminus").HealthIndicatorResult<"memory_heap"> & import("@nestjs/terminus").HealthIndicatorResult> | undefined, Partial<import("@nestjs/terminus").HealthIndicatorResult<string, import("@nestjs/terminus").HealthIndicatorStatus, Record<string, any>> & import("@nestjs/terminus").HealthIndicatorResult<"memory_rss"> & import("@nestjs/terminus").HealthIndicatorResult<"memory_heap"> & import("@nestjs/terminus").HealthIndicatorResult> | undefined>>;
}
