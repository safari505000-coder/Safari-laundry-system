import { execFileSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import { Pool } from 'pg';

loadEnv({ path: '.env.test', override: !process.env.DATABASE_URL });

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://user:pass@localhost:5432/safari_erp_test';

if (!databaseUrl.includes('safari_erp_test')) {
  throw new Error(
    `Refusing to run integration tests against non-test database: ${databaseUrl}`,
  );
}

process.env.DATABASE_URL = databaseUrl;

const pool = new Pool({ connectionString: databaseUrl });
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

export async function resetDb(): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
  `;

  if (rows.length === 0) {
    return;
  }

  const tableList = rows
    .map(({ tablename }) => `"public"."${tablename.replace(/"/g, '""')}"`)
    .join(', ');

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
}

export async function closeDb(): Promise<void> {
  if (closed) {
    return;
  }
  await prisma.$disconnect();
  await pool.end();
  closed = true;
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
