import { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { DiscordAlertService } from '../common/services/discord-alert.service';
import { OwnerDashboardService } from './owner-dashboard.service';
export declare class OwnerDashboardRefreshWorker implements OnModuleInit, OnModuleDestroy {
    private readonly dashboard;
    private readonly alerts;
    private readonly logger;
    private worker;
    constructor(dashboard: OwnerDashboardService, alerts: DiscordAlertService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    private process;
    private alertRepeatedFailure;
}
