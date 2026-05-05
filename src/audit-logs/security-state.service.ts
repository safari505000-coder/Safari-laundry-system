import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

export type ForbiddenAttempt = {
  at: number;
  endpoint: string;
};

@Injectable()
export class SecurityStateService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SecurityStateService.name);
  private redis: Redis | null = null;

  onModuleInit(): void {
    const url =
      process.env.REDIS_URL ??
      process.env.BULLMQ_REDIS_URL ??
      process.env.REDIS_PUBLIC_URL ??
      '';
    if (!url.trim()) {
      this.logger.warn('security_redis_unavailable');
      return;
    }
    this.redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    void this.redis.connect().catch(() => {
      this.redis = null;
      this.logger.warn('security_redis_connect_failed');
    });
  }

  onModuleDestroy(): void {
    void this.redis?.quit().catch(() => undefined);
    this.redis = null;
  }

  async isBlocked(keys: string[]): Promise<boolean> {
    const client = this.redis;
    if (!client) {
      return false;
    }
    const now = Date.now();
    for (const key of keys) {
      const value = await client.get(this.key('block', key));
      if (value && Number(value) > now) {
        return true;
      }
    }
    return false;
  }

  async block(keys: string[], until: number): Promise<void> {
    const client = this.redis;
    if (!client) {
      return;
    }
    const ttlMs = Math.max(1_000, until - Date.now());
    const pipeline = client.pipeline();
    for (const key of keys) {
      pipeline.set(this.key('block', key), String(until), 'PX', ttlMs);
    }
    await pipeline.exec();
  }

  async incrementWindow(key: string, ttlSeconds: number): Promise<number> {
    const client = this.redis;
    if (!client) {
      return 1;
    }
    const redisKey = this.key('rate', key);
    const count = await client.incr(redisKey);
    if (count === 1) {
      await client.expire(redisKey, ttlSeconds);
    }
    return count;
  }

  async addForbiddenAttempt(
    actorKey: string,
    endpoint: string,
    windowMs: number,
  ): Promise<ForbiddenAttempt[]> {
    const client = this.redis;
    const now = Date.now();
    if (!client) {
      return [{ at: now, endpoint }];
    }
    const redisKey = this.key('forbidden', actorKey);
    const member = JSON.stringify({
      at: now,
      endpoint,
      nonce: Math.random().toString(36).slice(2),
    });
    const min = now - windowMs;
    const pipeline = client.pipeline();
    pipeline.zadd(redisKey, now, member);
    pipeline.zremrangebyscore(redisKey, 0, min);
    pipeline.expire(redisKey, Math.ceil(windowMs / 1_000));
    await pipeline.exec();
    const rows = await client.zrange(redisKey, 0, -1);
    return rows
      .map((row) => this.parseAttempt(row))
      .filter((row): row is ForbiddenAttempt => Boolean(row));
  }

  async forbiddenAttempts(
    actorKey: string,
    windowMs: number,
  ): Promise<ForbiddenAttempt[]> {
    const client = this.redis;
    if (!client) {
      return [];
    }
    const redisKey = this.key('forbidden', actorKey);
    const now = Date.now();
    await client.zremrangebyscore(redisKey, 0, now - windowMs);
    const rows = await client.zrange(redisKey, 0, -1);
    return rows
      .map((row) => this.parseAttempt(row))
      .filter((row): row is ForbiddenAttempt => Boolean(row));
  }

  async acquireCooldown(key: string, ttlMs: number): Promise<boolean> {
    const client = this.redis;
    if (!client) {
      return true;
    }
    const result = await client.set(this.key('cooldown', key), '1', 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  private parseAttempt(row: string): ForbiddenAttempt | null {
    try {
      const value = JSON.parse(row) as ForbiddenAttempt;
      return typeof value.endpoint === 'string' && typeof value.at === 'number' ?
          { at: value.at, endpoint: value.endpoint }
        : null;
    } catch {
      return null;
    }
  }

  private key(scope: string, value: string): string {
    return `security:${scope}:${value}`;
  }
}
