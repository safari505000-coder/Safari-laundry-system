import { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
export type ForbiddenAttempt = {
    at: number;
    endpoint: string;
};
export declare class SecurityStateService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private redis;
    onModuleInit(): void;
    onModuleDestroy(): void;
    isBlocked(keys: string[]): Promise<boolean>;
    block(keys: string[], until: number): Promise<void>;
    incrementWindow(key: string, ttlSeconds: number): Promise<number>;
    addForbiddenAttempt(actorKey: string, endpoint: string, windowMs: number): Promise<ForbiddenAttempt[]>;
    forbiddenAttempts(actorKey: string, windowMs: number): Promise<ForbiddenAttempt[]>;
    acquireCooldown(key: string, ttlMs: number): Promise<boolean>;
    private parseAttempt;
    private key;
}
