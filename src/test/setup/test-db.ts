import './load-env-test';
import { execFileSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

/**
 * Integration test database bootstrap (`setupFilesAfterEnv`).
 *
 * Why CI / local integration runs used to cascade into “every suite exits 1”:
 * - Anything that kills the subprocess (migrate reset/deploy/invalid Prisma CLI flags)
 *   runs before assertions; Jest treats that as fatal setup.
 * - `migrate reset` terminates server backends; pooled `pg` clients can look “up” until
 *   the next checkout. Disconnect + reconnect aligns the singleton Prisma client with
 *   the freshly recreated schema without swapping the exported reference importers hold.
 *
 * We use schema reset via `migrate reset` (not `db push`): this repo relies on migrations
 * for production parity and append-only ledger triggers that block naive TRUNCATE.
 *
 * `--force`: non-interactive reset (CI / Jest has no TTY).
 * Omit invalid flags (e.g. `--skip-generate` on migrate reset): Prisma exits non‑zero → all suites abort.
 *
 * Subprocess: `execFileSync('npx', ['prisma', …])` avoids brittle shell-string parsing while still using
 * `stdio: 'inherit'` and an explicit subprocess `DATABASE_URL` (parity with CI env).
 */

const missingDatabaseUrlMessage = [
  'DATABASE_URL is required for integration tests.',
  'CI: export DATABASE_URL before `npm run test:integration`.',
  'Local: set it in `.env.test` (loaded by `./load-env-test`).',
].join('\n');

function assertSafeIntegrationDatabaseUrl(url: string): void {
  if (!url.includes('safari_erp_test') && !url.includes('localhost')) {
    throw new Error(
      `SAFETY: refusing integration DB URL (must target safari_erp_test or localhost). Got: ${url.slice(0, 48)}`,
    );
  }
}

function maskDatabaseUrlDiagnostics(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.href;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

/** Single source for env passed to subprocesses and the pooled client. */
function resolveIntegrationDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    if (process.env.CI) {
      console.error('[integration][test-db] CI=true but DATABASE_URL is empty or unset.');
    }
    throw new Error(missingDatabaseUrlMessage);
  }
  assertSafeIntegrationDatabaseUrl(raw);
  return raw;
}

function logCiDatabaseDiagnostics(databaseUrl: string): void {
  if (!process.env.CI) {
    return;
  }
  try {
    const u = new URL(databaseUrl);
    console.log('[integration][test-db] CI Postgres target:', `${u.hostname}:${u.port || '5432'}`);
    console.log('[integration][test-db] DATABASE_URL (masked):', maskDatabaseUrlDiagnostics(databaseUrl));
  } catch {
    console.warn('[integration][test-db] CI set but DATABASE_URL could not be parsed for logs.');
  }
}

const databaseUrl = resolveIntegrationDatabaseUrl();
process.env.DATABASE_URL = databaseUrl;
logCiDatabaseDiagnostics(databaseUrl);

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

function prismaSubprocessEnv(database: string): NodeJS.ProcessEnv {
  return { ...process.env, DATABASE_URL: database };
}

/**
 * Fully resets the Integration DB (`migrate reset` reapplies migrations, clears failed state).
 * Postgres drops existing connections — refresh this PrismaClient so importers keep a valid pool.
 */
export async function resetDb(prismaInst: PrismaClient): Promise<void> {
  if (process.env.CI) {
    console.log('[integration][test-db] migrate reset (force, skip seed) …');
  }
  try {
    execFileSync('npx', ['prisma', 'migrate', 'reset', '--force', '--skip-seed'], {
      env: prismaSubprocessEnv(databaseUrl),
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[integration][test-db] Database reset failed:', message);
    throw error;
  }
  await prismaInst.$disconnect().catch(() => undefined);
  await prismaInst.$connect();
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

beforeEach(async () => {
  await resetDb(prisma);
});

afterAll(async () => {
  await closeDb();
});
