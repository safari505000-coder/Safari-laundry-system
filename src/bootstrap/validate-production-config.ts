import type { PrismaService } from '../prisma/prisma.service';

function requireVar(name: string, value: string | undefined): void {
  if (!value?.trim()) {
    throw new Error(`FATAL: ${name} is required in production`);
  }
}

export function validateProductionConfig(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }
  if (process.env.SKIP_PRODUCTION_CONFIG_VALIDATION === 'true') {
    return;
  }
  const redisUrl =
    process.env.REDIS_URL ?? process.env.BULLMQ_REDIS_URL ?? process.env.REDIS_PUBLIC_URL;
  if (process.env.REQUIRE_REDIS_IN_PRODUCTION === 'true') {
    requireVar('REDIS_URL or BULLMQ_REDIS_URL', redisUrl);
  } else if (!redisUrl?.trim()) {
    console.warn(
      '[bootstrap] REDIS_URL/BULLMQ_REDIS_URL is not set; BullMQ-backed queues and caches are disabled.',
    );
  }
  if (redisUrl?.trim() && process.env.REDIS_PERSISTENCE_ACKNOWLEDGED !== 'true') {
    // BullMQ expects durable Redis (AOF and/or RDB). Ops must confirm infra.
    console.warn(
      '[bootstrap] Set REDIS_PERSISTENCE_ACKNOWLEDGED=true after verifying Redis AOF/RDB for queue durability.',
    );
  }
  requireVar('DATABASE_URL', process.env.DATABASE_URL);
  const discordOk =
    Boolean(process.env.DISCORD_WEBHOOK_URL?.trim()) ||
    process.env.DISCORD_ALERTS_DISABLED === 'true';
  if (!discordOk) {
    throw new Error(
      'FATAL: DISCORD_WEBHOOK_URL must be set or DISCORD_ALERTS_DISABLED=true in production',
    );
  }
  const sp = process.env.SECRETS_PROVIDER?.toLowerCase()?.trim();
  if (sp && sp !== 'aws' && sp !== 'vault') {
    throw new Error('FATAL: SECRETS_PROVIDER must be aws, vault, or unset');
  }
}

export async function validateProductionConnectivity(prisma: PrismaService): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }
  if (process.env.SKIP_PRODUCTION_CONFIG_VALIDATION === 'true') {
    return;
  }
  await prisma.$queryRaw`SELECT 1`;
}