import './load-env-test';
import { execFileSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/safari_erp_test';

function assertSafeIntegrationDatabaseUrl(url: string): void {
  if (!url.includes('safari_erp_test') && !url.includes('localhost')) {
    throw new Error(
      `SAFETY: Refusing to run integration tests against non-test database. URL: ${url.slice(0, 40)}`,
    );
  }
}

assertSafeIntegrationDatabaseUrl(databaseUrl);

process.env.DATABASE_URL = databaseUrl;

const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
  connectionTimeoutMillis: 30_000,
  idleTimeoutMillis: 10_000,
});
let closed = false;

export const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

let migrationsApplied = false;

export function runMigrations(): void {
  if (migrationsApplied) {
    return;
  }

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  migrationsApplied = true;
}

/**
 * Resets integration DB state without walking every FK edge manually.
 *
 * Sequential `deleteMany()` over a partial table list misses relations on models
 * that were added in schema but not listed here (CI then throws FK violations or
 * exhausts the pool). A single `TRUNCATE … CASCADE` matches what `migrate reset`
 * would do for data: clear all application tables while keeping `_prisma_migrations`.
 * Builds the list purely from `pg_catalog` heap / partitioned-root relations (`relkind` `r`|`p`),
 * skips partition-member heaps (`relispartition`), and uses `oid::regclass` so each target
 * is unambiguously a truncatable relation (no `information_schema` / heap OID skew).
 */
export async function resetDb(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('safari_erp_test') && !url.includes('localhost')) {
    throw new Error(
      `SAFETY: Refusing to reset non-test DB. URL: ${url.slice(0, 40)}`,
    );
  }

  await prisma.$executeRawUnsafe(`
DO $$
DECLARE
  stmt text;
BEGIN
  SELECT 'TRUNCATE TABLE ' ||
    string_agg(c.oid::regclass::text, ', ' ORDER BY c.oid::regclass::text)
    || ' RESTART IDENTITY CASCADE'
  INTO stmt
  FROM pg_class AS c
  INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname <> '_prisma_migrations'
    AND c.relkind IN ('r'::"char", 'p'::"char")
    AND NOT COALESCE(c.relispartition, false);
  IF stmt IS NOT NULL THEN
    EXECUTE stmt;
  END IF;
END $$;
`);
}

export async function closeDb(): Promise<void> {
  if (closed) {
    return;
  }
  try {
    await prisma.$disconnect();
  } finally {
    await pool.end();
    closed = true;
  }
}

beforeAll(async () => {
  runMigrations();
  await prisma.$connect();
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});
