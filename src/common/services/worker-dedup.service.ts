import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

/** Redis SET NX — at-most-once side-effect guard per BullMQ job id (horizontally scalable). */
@Injectable()
export class WorkerDedupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerDedupService.name);
  private redis: Redis | null = null;
  private readonly ttlSec = Number.parseInt(process.env.WORKER_DEDUP_TTL_SEC ?? '604800', 10) || 604_800;

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

  /**
   * @returns true if this instance may process (first claim), false if already completed elsewhere
   */
  async claimWorkerSideEffect(
    queue: string,
    jobId: string,
    meta?: { traceId?: string; orderId?: string },
  ): Promise<boolean> {
    const client = this.redis;
    if (!client) {
      return true;
    }
    const key = `worker:idem:${queue}:${jobId}`;
    try {
      const r = await client.set(key, '1', 'EX', this.ttlSec, 'NX');
      if (r !== 'OK') {
        this.logger.warn(
          JSON.stringify({
            event: 'worker_dedup_skip',
            traceId: meta?.traceId,
            orderId: meta?.orderId,
            queue,
            jobId: jobId.slice(0, 24),
          }),
        );
        return false;
      }
      return true;
    } catch {
      return true;
    }
  }

  /** Allow BullMQ retry after a failed attempt (claim is best-effort idempotency for success only). */
  async releaseWorkerSideEffect(queue: string, jobId: string): Promise<void> {
    const client = this.redis;
    if (!client) {
      return;
    }
    const key = `worker:idem:${queue}:${jobId}`;
    try {
      await client.del(key);
    } catch {
      /* empty */
    }
  }
}
