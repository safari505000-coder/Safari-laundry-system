import { SecurityStateService } from '../audit-logs/security-state.service';
import { IntegrationCircuitBreakerService } from '../common/services/integration-circuit-breaker.service';
type QueueName = 'alerts' | 'whatsapp';
export declare class QueueAdminService {
    private readonly circuitBreaker;
    private readonly securityState;
    private readonly logger;
    constructor(circuitBreaker: IntegrationCircuitBreakerService, securityState: SecurityStateService);
    replay(queueName: QueueName, limit?: number): Promise<{
        queue: QueueName;
        replayed: number;
        skipped: number;
    }>;
    listDlq(queueName?: QueueName, limit?: number): Promise<Record<string, unknown[]>>;
    replayJob(queueName: QueueName, jobId: string): Promise<{
        queue: QueueName;
        replayed: number;
        skipped: number;
    }>;
    metrics(): Promise<Record<string, unknown>>;
    private queue;
    private replayDlqJob;
    private assertReplayBudget;
}
export {};
