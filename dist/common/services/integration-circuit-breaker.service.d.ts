import { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
export type CircuitRecord = {
    state: CircuitState;
    failures: number;
    total: number;
    windowStartedAt: number;
    openedUntil: number;
    openedAt: number;
};
export declare class IntegrationCircuitBreakerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private redis;
    onModuleInit(): void;
    onModuleDestroy(): void;
    beforeRequest(name: string): Promise<CircuitState>;
    recordSuccess(name: string): Promise<void>;
    recordFailure(name: string): Promise<CircuitState>;
    state(name: string): Promise<CircuitRecord>;
    private read;
    private write;
    private closedRecord;
    private key;
}
