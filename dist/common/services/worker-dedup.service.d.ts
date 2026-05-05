import { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
export declare class WorkerDedupService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private redis;
    private readonly ttlSec;
    onModuleInit(): void;
    onModuleDestroy(): void;
    claimWorkerSideEffect(queue: string, jobId: string, meta?: {
        traceId?: string;
        orderId?: string;
    }): Promise<boolean>;
    releaseWorkerSideEffect(queue: string, jobId: string): Promise<void>;
}
