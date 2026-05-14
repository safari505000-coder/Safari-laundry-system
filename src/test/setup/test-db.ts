import './load-env-test';
import { execFileSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
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

export async function resetDb(prisma: any) {
  // Get explicit table names from Prisma schema only
  const models = Prisma.dmmf.datamodel.models.map((m) => `"${m.dbName || m.name}"`);

  if (models.length > 0) {
    const tableNames = models.join(', ');
    // Safely truncate only these specific tables
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE;`);
  }
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
  await resetDb(prisma);
});

afterAll(async () => {
  await closeDb();
});
