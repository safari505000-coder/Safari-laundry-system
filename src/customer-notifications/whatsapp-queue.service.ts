import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { Queue } from 'bullmq';
import { currentTraceId } from '../common/tracing/trace-context';
import type { PaymentConfirmedCustomerScenario } from './customer-notifications.service';
import {
  WHATSAPP_QUEUE,
  WHATSAPP_MAX_QUEUE_SIZE,
  WhatsAppJob,
  whatsappDefaultJobOptions,
  whatsappJobOptionsForEnqueue,
  whatsappRedisConnection,
} from './whatsapp.queue';

@Injectable()
export class WhatsAppQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppQueueService.name);
  private queue: Queue<WhatsAppJob> | null = null;

  onModuleInit(): void {
    try {
      const connection = whatsappRedisConnection();
      if (!connection) {
        return;
      }
      this.queue = new Queue<WhatsAppJob>(WHATSAPP_QUEUE, {
        connection,
        defaultJobOptions: whatsappDefaultJobOptions(),
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

  enqueuePaymentConfirmed(
    orderId: string,
    scenario?: PaymentConfirmedCustomerScenario,
  ): void {
    try {
      if (!this.queue) {
        return;
      }
      const data: WhatsAppJob = {
        event: 'payment_confirmed',
        payload: {
          orderId,
          scenario,
          timestamp: Date.now(),
        },
        meta: {
          traceId: currentTraceId(),
        },
      };
      this.logger.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          event: 'whatsapp_queue_enqueue',
          traceId: data.meta?.traceId,
          orderId,
          alertEvent: 'payment_confirmed',
        }),
      );
      void this.queue
        .count()
        .then((size) => {
          const span = trace.getTracer('safari-erp').startSpan('queue.enqueue.whatsapp');
          if (size >= WHATSAPP_MAX_QUEUE_SIZE) {
            this.logger.error(
              JSON.stringify({
                timestamp: new Date().toISOString(),
                event: 'system_overload',
                traceId: data.meta?.traceId,
                orderId,
                queue: 'whatsapp',
                size,
                droppedAlert: 'payment_confirmed',
              }),
            );
            span.end();
            return undefined;
          }
          if (size >= WHATSAPP_MAX_QUEUE_SIZE * 0.8) {
            this.logger.warn(`alert_queue_large queue=whatsapp size=${size}`);
          }
          const add = this.queue?.add(
            'payment_confirmed',
            data,
            whatsappJobOptionsForEnqueue(orderId),
          );
          span.end();
          return add;
        })
        .catch(() => undefined);
    } catch {
      // WhatsApp enqueue must never throw into the caller.
    }
  }
}
