import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import axios from 'axios';
import { Job, Queue, Worker } from 'bullmq';
import { runWithJobTraceAsync } from '../tracing/trace-context';
import {
  buildDiscordMessage,
  DISCORD_ALERT_ATTEMPTS,
  DISCORD_ALERT_BATCH_FLUSH_MS,
  DISCORD_ALERT_BATCH_SIZE,
  DISCORD_ALERT_BACKOFF_MS,
  DISCORD_ALERT_DLQ_QUEUE,
  DISCORD_ALERT_QUEUE,
  DISCORD_ALERT_TIMEOUT_MS,
  DiscordAlertJob,
  discordRedisConnection,
  isDiscordCriticalEvent,
} from './discord-alert.queue';
import { IntegrationCircuitBreakerService } from './integration-circuit-breaker.service';
import { WorkerDedupService } from './worker-dedup.service';
import { DiscordAlertService } from './discord-alert.service';

type PendingJob = {
  job: Job<DiscordAlertJob>;
  resolve: () => void;
  reject: (error: Error) => void;
};

@Injectable()
export class DiscordAlertWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscordAlertWorker.name);
  private worker: Worker<DiscordAlertJob> | null = null;
  private dlq: Queue<
    DiscordAlertJob & { error?: string; attempts?: number; lastFailureAt?: number }
  > | null = null;
  private readonly pending: PendingJob[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isFlushing = false;
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;
  private destroyed = false;

  constructor(
    private readonly circuitBreaker: IntegrationCircuitBreakerService,
    private readonly dedup: WorkerDedupService,
    private readonly discordAlerts: DiscordAlertService,
  ) {}

  onModuleInit(): void {
    try {
      const connection = discordRedisConnection();
      if (!connection) {
        return;
      }

      this.dlq = new Queue<
        DiscordAlertJob & { error?: string; attempts?: number; lastFailureAt?: number }
      >(
        DISCORD_ALERT_DLQ_QUEUE,
        { connection },
      );
      this.worker = new Worker<DiscordAlertJob>(
        DISCORD_ALERT_QUEUE,
        (job) => this.process(job),
        {
          connection,
          concurrency: 5,
          limiter: {
            max: 5,
            duration: 1_000,
          },
          settings: {
            backoffStrategy: (_attemptsMade, _type, _err, job) => {
              const attempts = job?.attemptsMade ?? 0;
              return (
                DISCORD_ALERT_BACKOFF_MS * 2 ** attempts +
                Math.floor(Math.random() * 500)
              );
            },
          },
        },
      );

      this.worker.on('completed', (job) =>
        this.logger.log(`alert_job_success event=${job.data.event}`),
      );
      this.worker.on('failed', (job, error) => {
        if (job && job.attemptsMade >= DISCORD_ALERT_ATTEMPTS) {
          this.discordAlerts.enqueue('ops_retry_exhausted', {
            queue: 'discord',
            jobId: String(job.id),
            sourceEvent: job.data.event,
            orderId:
              typeof job.data.payload?.orderId === 'string' ? job.data.payload.orderId : undefined,
            traceId: job.data.meta?.traceId,
            error: error?.message ?? 'unknown',
            timestamp: Date.now(),
          });
          this.logger.error('alert_permanent_failure queue=discord');
          void this.dlq
            ?.add(
              'failed',
              {
                ...job.data,
                error: error?.message ?? 'unknown',
                attempts: job.attemptsMade,
                lastFailureAt: Date.now(),
              },
              {
                attempts: 1,
                removeOnComplete: false,
                removeOnFail: false,
              },
            )
            .catch(() => undefined);
        }
      });
      this.worker.on('error', () => undefined);
    } catch {
      this.worker = null;
    }
  }

  onModuleDestroy(): void {
    try {
      this.destroyed = true;
      if (this.flushTimer) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
      }
      const shutdownError = new Error('discord_alert_worker_shutdown');
      while (this.pending.length > 0) {
        this.pending.shift()?.reject(shutdownError);
      }
      void this.worker?.close().catch(() => undefined);
      void this.dlq?.close().catch(() => undefined);
      this.worker = null;
      this.dlq = null;
    } catch {
      this.worker = null;
    }
  }

  private process(job: Job<DiscordAlertJob>): Promise<void> {
    try {
      if (isDiscordCriticalEvent(job.data.event)) {
        return this.processCritical(job);
      }

      return new Promise<void>((resolve, reject) => {
        this.pending.push({ job, resolve, reject });
        if (this.pending.length >= DISCORD_ALERT_BATCH_SIZE) {
          void this.flushBatch().catch(() => undefined);
          return;
        }
        this.scheduleFlush();
      });
    } catch {
      return Promise.resolve();
    }
  }

  private async processCritical(job: Job<DiscordAlertJob>): Promise<void> {
    return runWithJobTraceAsync(job.data.meta?.traceId, 'worker.discord.critical', async () => {
      const jid = String(job.id);
      const orderId =
        typeof job.data.payload?.orderId === 'string' ? job.data.payload.orderId : undefined;
      if (
        !(await this.dedup.claimWorkerSideEffect(DISCORD_ALERT_QUEUE, jid, {
          traceId: job.data.meta?.traceId,
          orderId,
        }))
      ) {
        return;
      }
      try {
        await this.waitForCircuit();
        await this.sendBatch([job.data]);
        this.consecutiveFailures = 0;
      } catch (error) {
        await this.dedup.releaseWorkerSideEffect(DISCORD_ALERT_QUEUE, jid);
        this.recordFailure();
        throw this.retryableError(error);
      }
    });
  }

  private scheduleFlush(): void {
    if (this.flushTimer || this.destroyed) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flushBatch().catch(() => undefined);
    }, DISCORD_ALERT_BATCH_FLUSH_MS);
    this.flushTimer.unref?.();
  }

  private async flushBatch(): Promise<void> {
    if (this.isFlushing || this.destroyed || this.pending.length === 0) {
      return;
    }

    this.isFlushing = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const batch = this.pending.splice(0, DISCORD_ALERT_BATCH_SIZE);
    const toSend: PendingJob[] = [];
    for (const entry of batch) {
      const jid = String(entry.job.id);
      const orderId =
        typeof entry.job.data.payload?.orderId === 'string' ?
          entry.job.data.payload.orderId
        : undefined;
      if (
        await this.dedup.claimWorkerSideEffect(DISCORD_ALERT_QUEUE, jid, {
          traceId: entry.job.data.meta?.traceId,
          orderId,
        })
      ) {
        toSend.push(entry);
      } else {
        entry.resolve();
      }
    }
    if (toSend.length === 0) {
      this.isFlushing = false;
      if (this.pending.length > 0) {
        this.scheduleFlush();
      }
      return;
    }

    const span = trace.getTracer('safari-erp').startSpan('worker.discord.batch');
    try {
      await this.waitForCircuit();
      await this.sendBatch(toSend.map((entry) => entry.job.data));
      this.consecutiveFailures = 0;
      for (const entry of toSend) {
        entry.resolve();
      }
    } catch (error) {
      for (const entry of toSend) {
        await this.dedup.releaseWorkerSideEffect(DISCORD_ALERT_QUEUE, String(entry.job.id));
      }
      this.recordFailure();
      const retryable = this.retryableError(error);
      for (const entry of toSend) {
        entry.reject(retryable);
      }
    } finally {
      span.end();
      this.isFlushing = false;
      if (this.pending.length > 0) {
        this.scheduleFlush();
      }
    }
  }

  private async sendBatch(batch: DiscordAlertJob[]): Promise<void> {
    const webhookUrl = this.webhookUrl();
    if (!webhookUrl || batch.length === 0) {
      return;
    }
    const circuitState = await this.circuitBreaker.beforeRequest('discord');
    if (circuitState === 'OPEN') {
      throw this.retryableError('discord_circuit_open');
    }

    let response;
    try {
      response = await axios.post(webhookUrl, buildDiscordMessage(batch), {
        timeout: DISCORD_ALERT_TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
          ...(batch[0]?.meta?.traceId ?
            { 'x-trace-id': String(batch[0].meta.traceId) }
          : {}),
        },
        validateStatus: () => true,
      });
    } catch (error) {
      await this.circuitBreaker.recordFailure('discord');
      throw this.retryableError(error);
    }

    if (response.status >= 200 && response.status < 300) {
      await this.circuitBreaker.recordSuccess('discord');
      return;
    }
    if (response.status >= 500) {
      await this.circuitBreaker.recordFailure('discord');
      throw this.retryableError(`discord_5xx status=${response.status}`);
    }
  }

  private recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= 5) {
      this.circuitOpenUntil = Date.now() + 30_000;
      this.consecutiveFailures = 0;
      this.logger.warn('circuit_opened integration=discord');
    }
  }

  private async waitForCircuit(): Promise<void> {
    const waitMs = this.circuitOpenUntil - Date.now();
    if (waitMs > 0) {
      await this.delay(waitMs);
    }
    const st = await this.circuitBreaker.state('discord');
    if (st.state === 'OPEN' && st.openedUntil > Date.now()) {
      const extra = Math.min(30_000, st.openedUntil - Date.now() + 2_000);
      if (extra > 0) {
        await this.delay(extra);
      }
    }
  }

  private retryableError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    return new Error(String(error || 'discord_alert_retryable_failure'));
  }

  private webhookUrl(): string {
    try {
      return process.env.DISCORD_WEBHOOK_URL?.trim() ?? '';
    } catch {
      return '';
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, Math.max(0, ms));
    });
  }
}
