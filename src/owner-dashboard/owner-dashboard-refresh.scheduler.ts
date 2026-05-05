import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  OWNER_DASHBOARD_JOB_ID,
  OWNER_DASHBOARD_QUEUE,
  OWNER_DASHBOARD_REFRESH_MS,
  REFRESH_OWNER_DASHBOARD_JOB,
  ownerDashboardRedisConnection,
  ownerDashboardRefreshJobOptions,
} from './owner-dashboard.queue';

@Injectable()
export class OwnerDashboardRefreshScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OwnerDashboardRefreshScheduler.name);
  private queue: Queue | null = null;

  async onModuleInit(): Promise<void> {
    const connection = ownerDashboardRedisConnection();
    if (!connection) {
      this.logger.warn(
        JSON.stringify({
          event: 'owner_dashboard_refresh_queue_unconfigured',
          traceId: undefined,
          orderId: undefined,
          queue: OWNER_DASHBOARD_QUEUE,
        }),
      );
      return;
    }

    this.queue = new Queue(OWNER_DASHBOARD_QUEUE, {
      connection,
      defaultJobOptions: {
        removeOnComplete: false,
        removeOnFail: false,
      },
    });

    try {
      await this.removeDuplicateRepeatables();
      await this.queue.add(
        REFRESH_OWNER_DASHBOARD_JOB,
        { scheduledAt: Date.now() },
        ownerDashboardRefreshJobOptions(),
      );
      this.logger.log(
        JSON.stringify({
          event: 'owner_dashboard_refresh_repeatable_job_ensured',
          traceId: undefined,
          orderId: undefined,
          queue: OWNER_DASHBOARD_QUEUE,
          jobName: REFRESH_OWNER_DASHBOARD_JOB,
          jobId: OWNER_DASHBOARD_JOB_ID,
          everyMs: OWNER_DASHBOARD_REFRESH_MS,
        }),
      );
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'owner_dashboard_refresh_repeatable_job_failed',
          traceId: undefined,
          orderId: undefined,
          queue: OWNER_DASHBOARD_QUEUE,
          jobName: REFRESH_OWNER_DASHBOARD_JOB,
          jobId: OWNER_DASHBOARD_JOB_ID,
          reason: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  onModuleDestroy(): void {
    void this.queue?.close().catch(() => undefined);
    this.queue = null;
  }

  private async removeDuplicateRepeatables(): Promise<void> {
    const queue = this.queue;
    if (!queue) {
      return;
    }
    const repeatables = await queue.getRepeatableJobs();
    for (const job of repeatables) {
      const everyMs = Number(job.every);
      const duplicate =
        job.name === REFRESH_OWNER_DASHBOARD_JOB &&
        (job.id !== OWNER_DASHBOARD_JOB_ID || everyMs !== OWNER_DASHBOARD_REFRESH_MS);
      if (!duplicate) {
        continue;
      }
      await queue.removeRepeatableByKey(job.key);
      this.logger.warn(
        JSON.stringify({
          event: 'owner_dashboard_refresh_duplicate_repeatable_removed',
          traceId: undefined,
          orderId: undefined,
          queue: OWNER_DASHBOARD_QUEUE,
          jobName: job.name,
          jobId: job.id,
          everyMs,
          key: job.key,
        }),
      );
    }
  }
}
