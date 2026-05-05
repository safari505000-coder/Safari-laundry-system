import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import {
  DISCORD_ALERT_DLQ_QUEUE,
  DISCORD_ALERT_QUEUE,
  discordRedisConnection,
} from '../common/services/discord-alert.queue';
import { WHATSAPP_DLQ_QUEUE, WHATSAPP_QUEUE } from '../customer-notifications/whatsapp.queue';

const STALL_MS = Number.parseInt(process.env.QUEUE_STALL_DETECT_MS ?? '600000', 10) || 600_000;

@Injectable()
export class QueueIntegrityService implements OnModuleInit {
  private readonly logger = new Logger(QueueIntegrityService.name);

  onModuleInit(): void {
    void this.scanOnce('startup').catch(() => undefined);
  }

  @Interval(120_000)
  async periodic(): Promise<void> {
    await this.scanOnce('interval');
  }

  private async scanOnce(source: string): Promise<void> {
    const connection = discordRedisConnection();
    if (!connection) {
      return;
    }
    const queues = [
      { name: DISCORD_ALERT_QUEUE, label: 'discord' },
      { name: WHATSAPP_QUEUE, label: 'whatsapp' },
    ];
    const now = Date.now();
    for (const q of queues) {
      const queue = new Queue(q.name, { connection });
      try {
        const active = await queue.getJobs(['active'], 0, 50);
        for (const job of active) {
          const age = now - (job.processedOn ?? job.timestamp);
          if (job.processedOn && age > STALL_MS) {
            this.logger.error(
              JSON.stringify({
                event: 'queue_recovery_stalled_job',
                traceId: job.data?.meta?.traceId,
                orderId: job.data?.payload?.orderId,
                queue: q.label,
                jobId: job.id,
                stallAgeMs: age,
                source,
              }),
            );
          }
        }
      } finally {
        await queue.close().catch(() => undefined);
      }
    }
    const dlq = [
      { name: DISCORD_ALERT_DLQ_QUEUE, label: 'discord_dlq' },
      { name: WHATSAPP_DLQ_QUEUE, label: 'whatsapp_dlq' },
    ];
    for (const q of dlq) {
      const queue = new Queue(q.name, { connection });
      try {
        const [w, f] = await Promise.all([
          queue.getWaitingCount(),
          queue.getFailedCount(),
        ]);
        if (w + f > 0) {
          this.logger.log(
            JSON.stringify({
              event: 'queue_recovery_dlq_snapshot',
              traceId: undefined,
              orderId: undefined,
              queue: q.label,
              waiting: w,
              failed: f,
              source,
            }),
          );
        }
      } finally {
        await queue.close().catch(() => undefined);
      }
    }
  }
}
