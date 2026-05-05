import { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
export declare class FinanceDashboardCacheService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private redis;
    private readonly memory;
    onModuleInit(): void;
    onModuleDestroy(): void;
    get(key: string): Promise<string | null>;
    set(key: string, json: string): Promise<void>;
    cacheKey(segment: string, parts: Record<string, string | undefined>): string;
    wrapJson<T>(key: string, compute: () => Promise<T>): Promise<T>;
    clearMemoryCacheForTests(): void;
}
