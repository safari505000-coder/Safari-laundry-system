import { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
export declare class BcryptService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private readonly workers;
    private readonly pending;
    private nextId;
    private rr;
    readonly rounds: number;
    onModuleInit(): void;
    onModuleDestroy(): Promise<void>;
    hash(password: string, rounds?: number): Promise<string>;
    compare(password: string, hash: string): Promise<boolean>;
    private dispatch;
    private resolvePoolSize;
    private resolveRounds;
}
