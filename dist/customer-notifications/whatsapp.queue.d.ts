import { JobsOptions } from "bullmq";
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
export declare const WHATSAPP_QUEUE = "whatsapp";
export declare const WHATSAPP_DLQ_QUEUE = "whatsapp:failed";
export declare const WHATSAPP_ATTEMPTS = 5;
export declare const WHATSAPP_BACKOFF_MS = 1000;
export declare const WHATSAPP_MAX_QUEUE_SIZE = 5000;
export declare const whatsappRedisConnection: typeof discordRedisConnection;
export declare function whatsappDefaultJobOptions(): JobsOptions;
export declare function whatsappJobOptionsForEnqueue(orderId: string): JobsOptions;
export declare function whatsappDlqOptions(failedJobId: string, orderId?: string): JobsOptions;
