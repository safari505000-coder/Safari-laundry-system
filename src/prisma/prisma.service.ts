import {
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

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
    get(target, prop, receiver) {
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
      return Reflect.get(target, prop, receiver);
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

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString?.trim()) {
      throw new Error('DATABASE_URL is not set');
    }
    const pool = new Pool({ connectionString });
    const options: Prisma.PrismaClientOptions = { adapter: new PrismaPg(pool) };
    super(options);
    this.pool = pool;

    // Guard the base (non-transactional) delegate on `this`.
    const baseGuarded = guardAppendOnlyDelegate(
      super.debtLedgerEntry as unknown as object,
      'DebtLedgerEntry',
    );
    Object.defineProperty(this, 'debtLedgerEntry', {
      configurable: true,
      enumerable: true,
      get: () => baseGuarded,
    });

    // Wrap `$transaction` so interactive callbacks receive a tx client
    // whose `debtLedgerEntry` delegate is also guarded. The batch form
    // `$transaction(Promise[])` is left untouched — those Promises were
    // already built on the guarded top-level delegate.
    const originalTransaction = super.$transaction.bind(this) as (
      ...args: unknown[]
    ) => Promise<unknown>;
    Object.defineProperty(this, '$transaction', {
      configurable: true,
      value: (
        ...args: Parameters<PrismaClient['$transaction']>
      ): ReturnType<PrismaClient['$transaction']> => {
        const first = args[0];
        if (typeof first === 'function') {
          const userCallback = first as (tx: unknown) => Promise<unknown>;
          const wrappedCallback = (tx: unknown) => {
            const txRec = tx as Record<string, unknown>;
            const innerDelegate = txRec.debtLedgerEntry as unknown as
              | object
              | undefined;
            if (innerDelegate && typeof innerDelegate === 'object') {
              const guarded = guardAppendOnlyDelegate(
                innerDelegate,
                'DebtLedgerEntry',
              );
              Object.defineProperty(txRec, 'debtLedgerEntry', {
                configurable: true,
                enumerable: true,
                value: guarded,
              });
            }
            return userCallback(tx);
          };
          return originalTransaction(
            wrappedCallback,
            ...args.slice(1),
          ) as ReturnType<PrismaClient['$transaction']>;
        }
        return originalTransaction(...args) as ReturnType<
          PrismaClient['$transaction']
        >;
      },
    });

    PrismaService.logger.log(
      'DebtLedgerEntry append-only guard active (update/delete/upsert blocked)',
    );
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
  }
}

/**
 * V19.11 — exported for backfill scripts and tests that want the same
 * append-only guard applied to a bespoke PrismaClient instance without
 * going through Nest DI.
 */
export { guardAppendOnlyDelegate };
