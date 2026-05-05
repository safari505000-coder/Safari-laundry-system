import { Counter, Gauge, Histogram, Registry } from "prom-client";
export declare class MetricsService {
    readonly registry: Registry<"text/plain; version=0.0.4; charset=utf-8">;
    readonly finalizeDuration: Histogram<string>;
    readonly finalizeSuccess: Counter<string>;
    readonly finalizeFailure: Counter<string>;
    readonly controllerDuration: Histogram<"method" | "route" | "status">;
    readonly queueJobs: Gauge<"queue" | "state">;
    readonly queueJobsActive: Gauge<"queue">;
    readonly queueJobsWaiting: Gauge<"queue">;
    readonly queueJobsFailed: Gauge<"queue">;
    readonly queueJobsCompleted: Gauge<"queue">;
    readonly circuitState: Gauge<"service">;
    readonly redisLatency: Gauge<string>;
    readonly dbQueryDuration: Histogram<string>;
    readonly sloPaymentSuccessRatio: Gauge<string>;
    readonly sloLatencyP95: Gauge<string>;
    readonly sloErrorBudgetRemaining: Gauge<string>;
    readonly paymentsPerMinute: Gauge<string>;
    readonly paymentFailureRate: Gauge<string>;
    readonly revenueTotal: Gauge<string>;
    readonly queueDelayEstimate: Gauge<string>;
    private readonly finalizeSamples;
    private static readonly SAMPLE_MAX_AGE_MS;
    private static readonly SAMPLE_CAP;
    constructor();
    recordFinalize(durationMs: number, ok: boolean): void;
    setRevenueTotalKd(value: number): void;
    setQueueDelayEstimateSeconds(value: number): void;
    paymentSnapshot(): {
        successRate: number;
        successCount: number;
        failureCount: number;
    };
    refreshDerivedSloGauges(): void;
    private trimSamples;
    prometheus(): Promise<string>;
}
