export type DiscordAlertPayload = {
    orderId?: string;
    trackId?: string | null;
    transId?: string | null;
    amount?: string | number;
    version?: string;
    timestamp?: number;
    [key: string]: unknown;
};
export type DiscordAlertJob = {
    event: string;
    payload: DiscordAlertPayload & {
        timestamp: number;
    };
    meta?: {
        traceId?: string;
    };
};
export type DiscordEmbed = {
    title: string;
    color: number;
    fields: Array<{
        name: string;
        value: string;
        inline?: boolean;
    }>;
};
export declare const DISCORD_ALERT_QUEUE = "discord-alerts";
export declare const DISCORD_ALERT_DLQ_QUEUE = "alerts:failed";
export declare const CRITICAL_DISCORD_EVENT = "captured_payment_not_finalized";
export declare const PAYMENT_CONSISTENCY_CRITICAL_EVENT = "payment_consistency_stale_wallet";
export declare function isDiscordCriticalEvent(event: string): boolean;
export declare const DISCORD_ALERT_ATTEMPTS = 5;
export declare const DISCORD_ALERT_BACKOFF_MS = 1000;
export declare const DISCORD_ALERT_TIMEOUT_MS = 3000;
export declare const DISCORD_ALERT_BATCH_SIZE = 10;
export declare const DISCORD_ALERT_BATCH_FLUSH_MS = 1000;
export declare const DISCORD_ALERT_MAX_QUEUE_SIZE = 5000;
type RedisConnectionOptions = {
    host: string;
    port: number;
    username?: string;
    password?: string;
    db?: number;
    tls?: Record<string, never>;
    maxRetriesPerRequest?: null;
};
export declare function discordRedisConnection(): RedisConnectionOptions | null;
export declare function buildDiscordMessage(batch: DiscordAlertJob[]): {
    content: string;
    embeds: DiscordEmbed[];
};
export {};
