import { IntegrationCircuitBreakerService } from '../common/services/integration-circuit-breaker.service';
import { MetricsService } from './metrics.service';
export declare class QueueMetricsCollector {
    private readonly metrics;
    private readonly circuitBreaker;
    private readonly logger;
    constructor(metrics: MetricsService, circuitBreaker: IntegrationCircuitBreakerService);
    collect(): Promise<void>;
}
