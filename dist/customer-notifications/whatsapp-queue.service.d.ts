import { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { PaymentConfirmedCustomerScenario } from './customer-notifications.service';
export declare class WhatsAppQueueService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private queue;
    onModuleInit(): void;
    onModuleDestroy(): void;
    enqueuePaymentConfirmed(orderId: string, scenario?: PaymentConfirmedCustomerScenario): void;
}
