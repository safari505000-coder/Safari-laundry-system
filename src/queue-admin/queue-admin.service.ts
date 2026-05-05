import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { SecurityStateService } from '../audit-logs/security-state.service';
import {
  DISCORD_ALERT_DLQ_QUEUE,
  DISCORD_ALERT_QUEUE,
  discordRedisConnection,
} from '../common/services/discord-alert.queue';
import { IntegrationCircuitBreakerService } from '../common/services/integration-circuit-breaker.service';
import { WHATSAPP_DLQ_QUEUE, WHATSAPP_QUEUE } from '../customer-notifications/whatsapp.queue';

type QueueName = 'alerts' | 'whatsapp';

type QueueConfig = {
  main: string;
  dlq: string;
  circuit: 'discord' | 'whatsapp';
};

const QUEUES: Record<QueueName, QueueConfig> = {
  alerts: {
    main: DISCORD_ALERT_QUEUE,
    dlq: DISCORD_ALERT_DLQ_QUEUE,
    circuit: 'discord',
  },
  whatsapp: {
    main: WHATSAPP_QUEUE,
    dlq: WHATSAPP_DLQ_QUEUE,
    circuit: 'whatsapp',
  },
};

@Injectable()
export class QueueAdminService {
  private readonly logger = new Logger(QueueAdminService.name);

  constructor(
    private readonly circuitBreaker: IntegrationCircuitBreakerService,
    private readonly securityState: SecurityStateService,
  ) {}

  async replay(queueName: QueueName, limit = 25) {
    await this.assertReplayBudget(queueName, limit);
    const config = QUEUES[queueName];
    const main = this.queue(config.main);
    const dlq = this.queue(config.dlq);
    this.logger.log(`replay_started queue=${queueName} limit=${limit}`);
    let replayed = 0;
    let skipped = 0;
    try {
      const jobs = await dlq.getJobs(['waiting', 'delayed', 'failed'], 0, limit - 1);
      for (const job of jobs) {
        const ok = await this.replayDlqJob(main, job);
        if (!ok) {
          skipped += 1;
          continue;
        }
        replayed += 1;
      }
      this.logger.log(`replay_completed queue=${queueName} replayed=${replayed} skipped=${skipped}`);
      return { queue: queueName, replayed, skipped };
    } catch (error) {
      this.logger.error(
        `replay_failed queue=${queueName} reason=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    } finally {
      await Promise.all([
        main.close().catch(() => undefined),
        dlq.close().catch(() => undefined),
      ]);
    }
  }

  async listDlq(queueName?: QueueName, limit = 50) {
    const names = queueName ? [queueName] : (Object.keys(QUEUES) as QueueName[]);
    const result: Record<string, unknown[]> = {};
    for (const name of names) {
      const dlq = this.queue(QUEUES[name].dlq);
      try {
        const jobs = await dlq.getJobs(['waiting', 'delayed', 'failed'], 0, limit - 1);
        result[name] = jobs.map((job) => {
          const data = job.data as Record<string, unknown>;
          return {
            id: job.id,
            name: job.name,
            data: job.data,
            attemptsMade: job.attemptsMade,
            failedReason: job.failedReason,
            timestamp: job.timestamp,
            error: (data.error as string | undefined) ?? job.failedReason,
            attempts: (data.attempts as number | undefined) ?? job.attemptsMade,
            lastFailureAt: data.lastFailureAt as number | undefined,
          };
        });
      } finally {
        await dlq.close().catch(() => undefined);
      }
    }
    return result;
  }

  async replayJob(queueName: QueueName, jobId: string) {
    await this.assertReplayBudget(queueName, 1);
    const config = QUEUES[queueName];
    const main = this.queue(config.main);
    const dlq = this.queue(config.dlq);
    this.logger.log(`replay_started queue=${queueName} jobId=${jobId}`);
    try {
      const job = await dlq.getJob(jobId);
      if (!job) {
        return { queue: queueName, replayed: 0, skipped: 1 };
      }
      const ok = await this.replayDlqJob(main, job);
      this.logger.log(`replay_completed queue=${queueName} replayed=${ok ? 1 : 0}`);
      return { queue: queueName, replayed: ok ? 1 : 0, skipped: ok ? 0 : 1 };
    } catch (error) {
      this.logger.error(
        `replay_failed queue=${queueName} jobId=${jobId} reason=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    } finally {
      await Promise.all([
        main.close().catch(() => undefined),
        dlq.close().catch(() => undefined),
      ]);
    }
  }

  async metrics() {
    const result: Record<string, unknown> = {};
    for (const [name, config] of Object.entries(QUEUES) as Array<[QueueName, QueueConfig]>) {
      const main = this.queue(config.main);
      const dlq = this.queue(config.dlq);
      try {
        const [mainCounts, dlqCounts, circuit] = await Promise.all([
          main.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed', 'paused'),
          dlq.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed', 'paused'),
          this.circuitBreaker.state(config.circuit),
        ]);
        result[name] = {
          queueSize:
            (mainCounts.waiting ?? 0) +
            (mainCounts.active ?? 0) +
            (mainCounts.delayed ?? 0),
          jobsProcessed: mainCounts.completed ?? 0,
          jobsFailed: mainCounts.failed ?? 0,
          retries: mainCounts.delayed ?? 0,
          dlqCount:
            (dlqCounts.waiting ?? 0) +
            (dlqCounts.active ?? 0) +
            (dlqCounts.delayed ?? 0) +
            (dlqCounts.failed ?? 0),
          circuitState: circuit.state,
          circuitFailures: circuit.failures,
          circuitOpenedUntil: circuit.openedUntil ? new Date(circuit.openedUntil).toISOString() : null,
        };
      } finally {
        await Promise.all([
          main.close().catch(() => undefined),
          dlq.close().catch(() => undefined),
        ]);
      }
    }
    return result;
  }

  private queue(name: string): Queue {
    const connection = discordRedisConnection();
    if (!connection) {
      throw new ServiceUnavailableException('Redis queue connection is not configured');
    }
    return new Queue(name, { connection });
  }

  private async replayDlqJob(
    main: Queue,
    job: { name: string; data: unknown; remove(): Promise<void> },
  ): Promise<boolean> {
    const data = job.data as Record<string, unknown>;
    const replayCount = Number(data.replayCount ?? 0);
    if (replayCount >= 3) {
      return false;
    }
    await main.add(job.name === 'failed' ? 'replay' : job.name, {
      ...data,
      replayedFromDlq: true,
      replayCount: replayCount + 1,
      replayedAt: Date.now(),
    });
    await job.remove();
    return true;
  }

  private async assertReplayBudget(queueName: QueueName, requested: number): Promise<void> {
    const count = await this.securityState.incrementWindow(`queue-replay:${queueName}`, 60);
    if (count + requested > 100) {
      throw new ServiceUnavailableException('Replay rate limit exceeded');
    }
  }
}
