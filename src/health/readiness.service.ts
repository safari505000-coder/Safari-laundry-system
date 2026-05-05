import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
import {
  DISCORD_ALERT_QUEUE,
  discordRedisConnection,
} from '../common/services/discord-alert.queue';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<{
    ok: boolean;
    checks: Record<string, boolean>;
    region: string;
    deploymentColor: string;
  }> {
    const checks: Record<string, boolean> = {
      database: false,
      redis: false,
      queue: false,
    };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch {
      checks.database = false;
    }

    const conn = discordRedisConnection();
    if (!conn) {
      checks.redis = false;
      checks.queue = false;
    } else {
      const client = new Redis({
        host: conn.host,
        port: conn.port,
        username: conn.username,
        password: conn.password,
        db: conn.db,
        tls: conn.tls,
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
        connectTimeout: 2_000,
        lazyConnect: false,
      });
      try {
        const pong = await client.ping();
        checks.redis = pong === 'PONG';
        const queue = new Queue(DISCORD_ALERT_QUEUE, { connection: conn });
        try {
          await queue.getJobCounts('waiting', 'active');
          checks.queue = checks.redis;
        } finally {
          await queue.close().catch(() => undefined);
        }
      } catch {
        checks.redis = false;
        checks.queue = false;
      } finally {
        void client.quit().catch(() => undefined);
      }
    }

    const ok = checks.database && checks.redis && checks.queue;
    return {
      ok,
      checks,
      region: process.env.REGION ?? 'unknown',
      deploymentColor: process.env.DEPLOYMENT_COLOR ?? process.env.DEPLOYMENT_SLOT ?? 'blue',
    };
  }
}
