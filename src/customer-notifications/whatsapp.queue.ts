import { JobsOptions } from 'bullmq';
import { bullmqStableJobId } from '../common/queue/bullmq-job-id.util';
import { discordRedisConnection } from '../common/services/discord-alert.queue';
import type { PaymentConfirmedCustomerScenario } from './customer-notifications.service';

export type WhatsAppPaymentConfirmedJob = {
  event: 'payment_confirmed';
  payload: {
    orderId: string;
    scenario?: PaymentConfirmedCustomerScenario;
    timestamp: number;
  };
  meta?: {
    traceId?: string;
  };
};

export type WhatsAppJob = WhatsAppPaymentConfirmedJob;

export const WHATSAPP_QUEUE = 'whatsapp';
export const WHATSAPP_DLQ_QUEUE = 'whatsapp:failed';
export const WHATSAPP_ATTEMPTS = 5;
export const WHATSAPP_BACKOFF_MS = 1_000;
export const WHATSAPP_MAX_QUEUE_SIZE = 5_000;

export const whatsappRedisConnection = discordRedisConnection;

export function whatsappDefaultJobOptions(): JobsOptions {
  return {
    attempts: WHATSAPP_ATTEMPTS,
    backoff: { type: 'exponential', delay: WHATSAPP_BACKOFF_MS },
    removeOnComplete: false,
    removeOnFail: false,
  };
}

/** Stable BullMQ job id for payment_confirmed + order. */
export function whatsappJobOptionsForEnqueue(orderId: string): JobsOptions {
  return {
    ...whatsappDefaultJobOptions(),
    jobId: bullmqStableJobId('payment_confirmed', orderId),
  };
}

export function whatsappDlqOptions(failedJobId: string, orderId?: string): JobsOptions {
  return {
    ...whatsappDefaultJobOptions(),
    jobId: bullmqStableJobId('whatsapp_failed', orderId ?? failedJobId),
  };
}
