import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { Queue } from 'bullmq';
import { bullmqStableJobIdFromPayload } from '../queue/bullmq-job-id.util';
import { currentTraceId } from '../tracing/trace-context';
import {
  DISCORD_ALERT_ATTEMPTS,
  DISCORD_ALERT_BACKOFF_MS,
  DISCORD_ALERT_MAX_QUEUE_SIZE,
  DISCORD_ALERT_QUEUE,
  DiscordAlertJob,
  DiscordAlertPayload,
  discordRedisConnection,
  isDiscordCriticalEvent,
} from './discord-alert.queue';

@Injectable()
export class DiscordAlertService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscordAlertService.name);
  private queue: Queue<DiscordAlertJob> | null = null;

  onModuleInit(): void {
    try {
      const connection = discordRedisConnection();
      if (!connection) {
        return;
      }
      this.queue = new Queue<DiscordAlertJob>(DISCORD_ALERT_QUEUE, {
        connection,
        defaultJobOptions: {
          attempts: DISCORD_ALERT_ATTEMPTS,
          backoff: {
            type: 'exponential',
            delay: DISCORD_ALERT_BACKOFF_MS,
          },
          removeOnComplete: false,
          removeOnFail: false,
        },
      });
    } catch {
      this.queue = null;
    }
  }

  onModuleDestroy(): void {
    try {
      void this.queue?.close().catch(() => undefined);
      this.queue = null;
    } catch {
      this.queue = null;
    }
  }

  enqueue(event: string, payload: DiscordAlertPayload): void {
    try {
      if (!this.queue) {
        return;
      }

      const timestamp = this.toTimestamp(payload.timestamp);
      const isCritical = isDiscordCriticalEvent(event);
      const data: DiscordAlertJob = {
        event,
        payload: {
          ...payload,
          timestamp,
        },
        meta: {
          traceId:
            typeof payload.traceId === 'string' ? payload.traceId : currentTraceId(),
        },
      };

      this.logger.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          event: 'alert_queue_enqueue',
          traceId: data.meta?.traceId,
          orderId: typeof payload.orderId === 'string' ? payload.orderId : undefined,
          alertEvent: event,
        }),
      );
      const tracer = trace.getTracer('safari-erp');
      void this.queue
        .count()
        .then((size) =>
          tracer.startActiveSpan('queue.enqueue.discord', async (span) => {
            try {
              if (size >= DISCORD_ALERT_MAX_QUEUE_SIZE && !isCritical) {
                this.logger.error(
                  JSON.stringify({
                    timestamp: new Date().toISOString(),
                    event: 'system_overload',
                    traceId: data.meta?.traceId,
                    orderId: typeof payload.orderId === 'string' ? payload.orderId : undefined,
                    queue: 'discord',
                    size,
                    droppedAlert: event,
                  }),
                );
                return undefined;
              }
              if (size >= DISCORD_ALERT_MAX_QUEUE_SIZE * 0.8) {
                this.logger.warn(`alert_queue_large queue=discord size=${size}`);
              }
              return await this.queue?.add('alert', data, {
                jobId: bullmqStableJobIdFromPayload(event, {
                  ...payload,
                  traceId: data.meta?.traceId,
                } as Record<string, unknown>),
                priority: isCritical ? 1 : 5,
                attempts: DISCORD_ALERT_ATTEMPTS,
                backoff: {
                  type: 'exponential',
                  delay: DISCORD_ALERT_BACKOFF_MS,
                },
                removeOnComplete: false,
                removeOnFail: false,
              });
            } finally {
              span.end();
            }
          }),
        )
        .catch(() => undefined);
    } catch {
      // Alert enqueue must never throw into payment or security flows.
    }
  }

  private toTimestamp(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : Date.now();
  }
}
