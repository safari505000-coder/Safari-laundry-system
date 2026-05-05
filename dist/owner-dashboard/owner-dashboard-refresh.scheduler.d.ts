import { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
export declare class OwnerDashboardRefreshScheduler implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private queue;
    onModuleInit(): Promise<void>;
    onModuleDestroy(): void;
    private removeDuplicateRepeatables;
}
