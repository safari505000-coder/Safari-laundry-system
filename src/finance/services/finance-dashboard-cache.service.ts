import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

const PREFIX = 'finance:acct-dash:';
const TTL_SEC =
  Number.parseInt(process.env.FINANCE_DASHBOARD_CACHE_TTL_SEC ?? '45', 10) || 45;

/**
 * V19.32 — Optional Redis cache for accountant dashboard payloads.
 * Falls back to in-memory TTL map when REDIS_URL is unset or Redis errors.
 */
@Injectable()
export class FinanceDashboardCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FinanceDashboardCacheService.name);
  private redis: Redis | null = null;
  private readonly memory = new Map<string, { exp: number; raw: string }>();

  onModuleInit(): void {
    const raw =
      process.env.REDIS_URL ??
      process.env.BULLMQ_REDIS_URL ??
      process.env.REDIS_PUBLIC_URL ??
      '';
    if (!raw.trim()) {
      return;
    }
    this.redis = new Redis(raw, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    void this.redis.connect().catch(() => {
      this.redis = null;
    });
  }

  onModuleDestroy(): void {
    void this.redis?.quit().catch(() => undefined);
    this.redis = null;
  }

  async get(key: string): Promise<string | null> {
    const client = this.redis;
    if (client) {
      try {
        const v = await client.get(PREFIX + key);
        if (v) return v;
      } catch {
        this.logger.warn('finance_dash_cache_redis_read_failed');
      }
    }
    const m = this.memory.get(key);
    if (!m || m.exp < Date.now()) {
      if (m) this.memory.delete(key);
      return null;
    }
    return m.raw;
  }

  async set(key: string, json: string): Promise<void> {
    const client = this.redis;
    if (client) {
      try {
        await client.set(PREFIX + key, json, 'EX', TTL_SEC);
        return;
      } catch {
        this.logger.warn('finance_dash_cache_redis_write_failed');
      }
    }
    this.memory.set(key, { raw: json, exp: Date.now() + TTL_SEC * 1000 });
  }

  cacheKey(
    segment: string,
    parts: Record<string, string | undefined>,
  ): string {
    const flat = Object.entries(parts)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join('|');
    return `${segment}:${flat}`;
  }

  async wrapJson<T>(key: string, compute: () => Promise<T>): Promise<T> {
    const hit = await this.get(key);
    if (hit) {
      try {
        return JSON.parse(hit) as T;
      } catch {
        /* fall through */
      }
    }
    const next = await compute();
    void this.set(key, JSON.stringify(next)).catch(() => undefined);
    return next;
  }

  /**
   * Drops in-memory entries (Redis keys are not flushed). Used by integration
   * tests that assert TTL / post-mutation freshness when `REDIS_URL` is unset.
   */
  clearMemoryCacheForTests(): void {
    this.memory.clear();
  }
}
