import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export type CircuitRecord = {
  state: CircuitState;
  failures: number;
  total: number;
  windowStartedAt: number;
  openedUntil: number;
  /** Wall-clock ms when state last entered OPEN (0 if never / closed). */
  openedAt: number;
};

const FAILURE_THRESHOLD = 5;
const parsedOpenMs = Number.parseInt(process.env.INTEGRATION_CIRCUIT_OPEN_MS ?? '30000', 10);
const OPEN_MS =
  Number.isFinite(parsedOpenMs) && parsedOpenMs > 0 ? parsedOpenMs : 30_000;

@Injectable()
export class IntegrationCircuitBreakerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IntegrationCircuitBreakerService.name);
  private redis: Redis | null = null;

  onModuleInit(): void {
    const url =
      process.env.REDIS_URL ??
      process.env.BULLMQ_REDIS_URL ??
      process.env.REDIS_PUBLIC_URL ??
      '';
    if (!url.trim()) {
      return;
    }
    this.redis = new Redis(url, {
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

  async beforeRequest(name: string): Promise<CircuitState> {
    const record = await this.read(name);
    if (record.state === 'OPEN' && record.openedUntil > Date.now()) {
      return 'OPEN';
    }
    if (record.state === 'OPEN') {
      await this.write(name, { ...record, state: 'HALF_OPEN' });
      return 'HALF_OPEN';
    }
    return record.state;
  }

  async recordSuccess(name: string): Promise<void> {
    const record = await this.read(name);
    await this.write(name, {
      state: 'CLOSED',
      failures: 0,
      total: record.total + 1,
      windowStartedAt: record.windowStartedAt,
      openedUntil: 0,
      openedAt: 0,
    });
  }

  async recordFailure(name: string): Promise<CircuitState> {
    let record = await this.read(name);
    if (Date.now() - record.windowStartedAt > 60_000) {
      record = {
        state: record.state,
        failures: 0,
        total: 0,
        windowStartedAt: Date.now(),
        openedUntil: record.openedUntil,
        openedAt: record.openedAt,
      };
    }
    const failures = record.failures + 1;
    const total = record.total + 1;
    const failureRate = total > 0 ? failures / total : 0;
    if (
      record.state === 'HALF_OPEN' ||
      failures >= FAILURE_THRESHOLD ||
      (total >= 10 && failureRate >= 0.5)
    ) {
      const openedUntil = Date.now() + OPEN_MS;
      const openedAt = Date.now();
      await this.write(name, {
        state: 'OPEN',
        failures,
        total,
        windowStartedAt: record.windowStartedAt,
        openedUntil,
        openedAt,
      });
      this.logger.warn(`circuit_opened integration=${name}`);
      return 'OPEN';
    }
    await this.write(name, { ...record, failures, total });
    return record.state;
  }

  async state(name: string): Promise<CircuitRecord> {
    return this.read(name);
  }

  private async read(name: string): Promise<CircuitRecord> {
    const client = this.redis;
    if (!client) {
      return this.closedRecord();
    }
    const raw = await client.get(this.key(name));
    if (!raw) {
      return this.closedRecord();
    }
    try {
      const parsed = JSON.parse(raw) as Partial<CircuitRecord>;
      return {
        state:
          parsed.state === 'OPEN' || parsed.state === 'HALF_OPEN' ?
            parsed.state
          : 'CLOSED',
        failures: Number.isFinite(parsed.failures) ? Number(parsed.failures) : 0,
        total: Number.isFinite(parsed.total) ? Number(parsed.total) : 0,
        windowStartedAt:
          Number.isFinite(parsed.windowStartedAt) ?
            Number(parsed.windowStartedAt)
          : Date.now(),
        openedUntil:
          Number.isFinite(parsed.openedUntil) ? Number(parsed.openedUntil) : 0,
        openedAt: Number.isFinite(parsed.openedAt) ? Number(parsed.openedAt) : 0,
      };
    } catch {
      return this.closedRecord();
    }
  }

  private async write(name: string, record: CircuitRecord): Promise<void> {
    const client = this.redis;
    if (!client) {
      return;
    }
    await client.set(
      this.key(name),
      JSON.stringify(record),
      'PX',
      24 * 60 * 60 * 1_000,
    );
  }

  private closedRecord(): CircuitRecord {
    return {
      state: 'CLOSED',
      failures: 0,
      total: 0,
      windowStartedAt: Date.now(),
      openedUntil: 0,
      openedAt: 0,
    };
  }

  private key(name: string): string {
    return `circuit:${name}`;
  }
}
