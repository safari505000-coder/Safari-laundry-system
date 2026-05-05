import {
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { MetricsService } from '../observability/metrics.service';

/**
 * V19.11 — forbidden mutation verbs on the DebtLedgerEntry delegate.
 *
 * The ledger is append-only by construction: once a debt or payment is
 * written, no code path should ever mutate or delete it. The runtime
 * guard below replaces these methods with throwing stubs so any caller
 * (including the transactional client inside `$transaction`) fails loud
 * before reaching Postgres. The DB-level trigger ships in V19.12 as a
 * belt-and-suspenders measure.
 */
const APPEND_ONLY_FORBIDDEN = [
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
] as const;

function guardAppendOnlyDelegate<T extends object>(delegate: T, label: string): T {
  return new Proxy(delegate, {
    get(target, prop) {
      if (
        typeof prop === 'string' &&
        (APPEND_ONLY_FORBIDDEN as readonly string[]).includes(prop)
      ) {
        return () => {
          throw new ForbiddenException(
            `${label} is append-only — \`${prop}\` is not allowed`,
          );
        };
      }
      // IMPORTANT: read the property with `target` as the receiver (not the
      // Proxy) and bind any returned methods back to `target`. Prisma 7's
      // generated delegates use private class fields (`#state`) for their
      // internal query state; if we let `this` fall through as the Proxy,
      // those private reads throw "Transaction already closed: A query
      // cannot be executed on a committed transaction" at first call.
      const value = Reflect.get(target, prop, target) as unknown;
      if (typeof value === 'function') {
        return (value as (...args: unknown[]) => unknown).bind(target);
      }
      return value;
    },
  });
}

/**
 * Nest-global Prisma client (extends generated {@link PrismaClient}).
 * Prisma 7 requires a driver adapter for PostgreSQL — delegates like `user`, `branch`, etc. match the schema.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: Pool;
  private static readonly logger = new Logger(PrismaService.name);

  constructor(@Optional() private readonly metrics?: MetricsService) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString?.trim()) {
      throw new Error('DATABASE_URL is not set');
    }
    const pool = new Pool({ connectionString });
    const options: Prisma.PrismaClientOptions = {
      adapter: new PrismaPg(pool),
      log: [{ emit: 'event', level: 'query' }],
    };
    super(options);
    this.pool = pool;

    const prismaQueryEmitter = this as unknown as {
      $on(event: 'query', listener: (e: Prisma.QueryEvent) => void): void;
    };
    prismaQueryEmitter.$on('query', (e: Prisma.QueryEvent) => {
      this.metrics?.dbQueryDuration.observe(e.duration);
    });

    // V19.11.5 — the runtime Proxy-based append-only guard on
    // `debtLedgerEntry` broke Prisma 7's driver-adapter batching
    // ("Transaction already closed: A batch query cannot be executed
    // on a committed transaction") because parallel delegate calls
    // behind a Proxy lose internal query-engine state that Prisma
    // reads via private class fields (`#state`).
    //
    // The ledger is still append-only in practice:
    //   * every writer goes through `ledger.service.ts` which only
    //     calls `create` / `createMany` on this delegate, and
    //   * the DB-level trigger shipping in migration
    //     `20260422_append_only_debt_ledger_trigger.sql` blocks
    //     UPDATE/DELETE/TRUNCATE at the Postgres layer — the
    //     belt-and-suspenders we always wanted.
    //
    // Once we have a Proxy strategy that doesn't fight the driver
    // adapter's batching (e.g. a Prisma `$extends` client extension),
    // we can re-add an app-layer guard. Until then, the DB trigger
    // is the source of truth.
    PrismaService.logger.log(
      'DebtLedgerEntry append-only enforcement = DB trigger only (app-layer Proxy disabled for Prisma 7 compatibility)',
    );

    const auditDelegate = this.auditLog;
    (this as unknown as { auditLog: typeof auditDelegate }).auditLog =
      guardAppendOnlyDelegate(auditDelegate, 'AuditLog');
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
  }

  async timedQuery<T>(fn: () => Promise<T>): Promise<T> {
    const started = performance.now();
    try {
      return await fn();
    } finally {
      this.metrics?.dbQueryDuration.observe(performance.now() - started);
    }
  }
}

/**
 * V19.11 — exported for backfill scripts and tests that want the same
 * append-only guard applied to a bespoke PrismaClient instance without
 * going through Nest DI.
 */
export { guardAppendOnlyDelegate };
