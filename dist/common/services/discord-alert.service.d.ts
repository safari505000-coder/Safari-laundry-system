import { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { DiscordAlertPayload } from './discord-alert.queue';
export declare class DiscordAlertService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private queue;
    onModuleInit(): void;
    onModuleDestroy(): void;
    enqueue(event: string, payload: DiscordAlertPayload): void;
    private toTimestamp;
}
