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
  payload: DiscordAlertPayload & { timestamp: number };
  meta?: {
    traceId?: string;
  };
};

export type DiscordEmbed = {
  title: string;
  color: number;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
};

export const DISCORD_ALERT_QUEUE = 'discord-alerts';
export const DISCORD_ALERT_DLQ_QUEUE = 'alerts:failed';
export const CRITICAL_DISCORD_EVENT = 'captured_payment_not_finalized';
/** Must never be shed under queue backpressure (financial integrity). */
export const PAYMENT_CONSISTENCY_CRITICAL_EVENT = 'payment_consistency_stale_wallet';

export function isDiscordCriticalEvent(event: string): boolean {
  return (
    event === CRITICAL_DISCORD_EVENT ||
    event === PAYMENT_CONSISTENCY_CRITICAL_EVENT ||
    event.includes('suspicious') ||
    event === 'audit_chain_corruption' ||
    event === 'ops_retry_exhausted' ||
    event === 'ops_dlq_depth_alert' ||
    event === 'ops_circuit_open_prolonged' ||
    event === 'ops_time_skew' ||
    event === 'owner_dashboard_refresh_failed' ||
    event.startsWith('invariant_')
  );
}

export const DISCORD_ALERT_ATTEMPTS = 5;
export const DISCORD_ALERT_BACKOFF_MS = 1_000;
export const DISCORD_ALERT_TIMEOUT_MS = 3_000;
export const DISCORD_ALERT_BATCH_SIZE = 10;
export const DISCORD_ALERT_BATCH_FLUSH_MS = 1_000;
export const DISCORD_ALERT_MAX_QUEUE_SIZE = 5_000;

type RedisConnectionOptions = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: Record<string, never>;
  maxRetriesPerRequest?: null;
};

export function discordRedisConnection(): RedisConnectionOptions | null {
  const raw =
    process.env.REDIS_URL ??
    process.env.BULLMQ_REDIS_URL ??
    process.env.REDIS_PUBLIC_URL ??
    '';
  if (!raw.trim()) {
    return null;
  }

  try {
    const url = new URL(raw);
    const db = Number.parseInt(url.pathname.replace('/', ''), 10);
    return {
      host: url.hostname,
      port: url.port ? Number.parseInt(url.port, 10) : 6379,
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      db: Number.isFinite(db) ? db : undefined,
      tls: url.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: null,
    };
  } catch {
    return null;
  }
}

export function buildDiscordMessage(batch: DiscordAlertJob[]) {
  const message = {
    content: '🚨 Payment Alerts Batch',
    embeds: batch.slice(0, DISCORD_ALERT_BATCH_SIZE).map(toEmbed),
  };
  if (JSON.stringify(message).length > 5_500) {
    message.embeds = message.embeds.slice(0, 5);
  }
  return message;
}

function toEmbed(item: DiscordAlertJob): DiscordEmbed {
  const timestamp = item.payload.timestamp;
  const fields = Object.entries(item.payload)
    .filter(([, value]) => value !== undefined && value !== null)
    .slice(0, 20)
    .map(([name, value]) => ({
      name,
      value: field(Array.isArray(value) ? value.join(', ') : value),
      inline: false,
    }));

  return {
    title: item.event,
    color: resolveColor(item.event),
    fields: [
      { name: 'timestamp', value: new Date(timestamp).toISOString(), inline: false },
      ...fields.filter((entry) => entry.name !== 'timestamp'),
    ],
  };
}

function resolveColor(event: string): number {
  if (event === 'finalize_success') {
    return 0x2ecc71;
  }
  if (isDiscordCriticalEvent(event)) {
    return 0xe74c3c;
  }
  return 0xf1c40f;
}

function field(value: unknown): string {
  const text = value === undefined || value === null ? 'n/a' : String(value);
  return text.length > 0 ? text.slice(0, 1_024) : 'n/a';
}
