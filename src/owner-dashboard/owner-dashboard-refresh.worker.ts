import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { DiscordAlertService } from '../common/services/discord-alert.service';
import {
  OWNER_DASHBOARD_QUEUE,
  REFRESH_OWNER_DASHBOARD_JOB,
  ownerDashboardRedisConnection,
} from './owner-dashboard.queue';
import { OwnerDashboardService } from './owner-dashboard.service';

type OwnerDashboardRefreshJob = {
  scheduledAt?: number;
};

@Injectable()
export class OwnerDashboardRefreshWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OwnerDashboardRefreshWorker.name);
  private worker: Worker<OwnerDashboardRefreshJob> | null = null;

  constructor(
    private readonly dashboard: OwnerDashboardService,
    private readonly alerts: DiscordAlertService,
  ) {}

  onModuleInit(): void {
    const connection = ownerDashboardRedisConnection();
    if (!connection) {
      this.logger.warn(
        JSON.stringify({
          event: 'owner_dashboard_refresh_worker_unconfigured',
          traceId: undefined,
          orderId: undefined,
          queue: OWNER_DASHBOARD_QUEUE,
        }),
      );
      return;
    }

    this.worker = new Worker<OwnerDashboardRefreshJob>(
      OWNER_DASHBOARD_QUEUE,
      (job) => this.process(job),
      {
        connection,
        concurrency: 1,
        limiter: {
          max: 1,
          duration: 9_000,
        },
        settings: {
          backoffStrategy: (_attemptsMade, _type, _err, job) => {
            const attempts = job?.attemptsMade ?? 0;
            return 1_000 * 2 ** attempts + Math.floor(Math.random() * 300);
          },
        },
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(
        JSON.stringify({
          event: 'owner_dashboard_refresh_job_completed',
          traceId: undefined,
          orderId: undefined,
          jobId: job.id,
          jobName: job.name,
          attemptsMade: job.attemptsMade,
        }),
      );
    });
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        JSON.stringify({
          event: 'owner_dashboard_refresh_job_failed',
          traceId: undefined,
          orderId: undefined,
          jobId: job?.id,
          jobName: job?.name,
          attemptsMade: job?.attemptsMade,
          attemptsConfigured: job?.opts.attempts,
          reason: error?.message ?? 'unknown',
        }),
      );
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        this.alertRepeatedFailure(job, error);
      }
    });
    this.worker.on('error', (error) => {
      this.logger.error(
        JSON.stringify({
          event: 'owner_dashboard_refresh_worker_error',
          traceId: undefined,
          orderId: undefined,
          queue: OWNER_DASHBOARD_QUEUE,
          reason: error instanceof Error ? error.message : String(error),
        }),
      );
    });
  }

  onModuleDestroy(): void {
    void this.worker?.close().catch(() => undefined);
    this.worker = null;
  }

  private async process(job: Job<OwnerDashboardRefreshJob>): Promise<void> {
    if (job.name !== REFRESH_OWNER_DASHBOARD_JOB) {
      this.logger.warn(
        JSON.stringify({
          event: 'owner_dashboard_refresh_unknown_job',
          traceId: undefined,
          orderId: undefined,
          jobId: job.id,
          jobName: job.name,
        }),
      );
      return;
    }
    const started = performance.now();
    this.logger.log(
      JSON.stringify({
        event: 'owner_dashboard_refresh_job_started',
        traceId: undefined,
        orderId: undefined,
        jobId: job.id,
        jobName: job.name,
        attemptsMade: job.attemptsMade,
      }),
    );
    await this.dashboard.refreshDashboard();
    this.logger.log(
      JSON.stringify({
        event: 'owner_dashboard_refresh_cache_updated',
        traceId: undefined,
        orderId: undefined,
        jobId: job.id,
        jobName: job.name,
        durationMs: Math.round(performance.now() - started),
      }),
    );
  }

  private alertRepeatedFailure(
    job: Job<OwnerDashboardRefreshJob>,
    error: Error,
  ): void {
    this.alerts.enqueue('owner_dashboard_refresh_failed', {
      jobId: String(job.id),
      jobName: job.name,
      attemptsMade: job.attemptsMade,
      attemptsConfigured: job.opts.attempts ?? 1,
      error: error.message,
      timestamp: Date.now(),
    });
  }
}
