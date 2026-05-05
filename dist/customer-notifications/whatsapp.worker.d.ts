import { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from '../prisma/prisma.service';
import { DiscordAlertService } from '../common/services/discord-alert.service';
import { IntegrationCircuitBreakerService } from '../common/services/integration-circuit-breaker.service';
import { WorkerDedupService } from '../common/services/worker-dedup.service';
import { CustomerNotificationsService } from './customer-notifications.service';
export declare class WhatsAppWorker implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly customerNotifications;
    private readonly circuitBreaker;
    private readonly dedup;
    private readonly discordAlerts;
    private readonly logger;
    private worker;
    private dlq;
    constructor(prisma: PrismaService, customerNotifications: CustomerNotificationsService, circuitBreaker: IntegrationCircuitBreakerService, dedup: WorkerDedupService, discordAlerts: DiscordAlertService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    private process;
    private waitForCircuitIntegration;
    private delay;
    private buildPaymentConfirmedParams;
    private variantFor;
    private inferPaymentScenarioFromOrderAge;
}
