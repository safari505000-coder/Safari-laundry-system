#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Stage-G — Prisma migration drift guard.
 *
 * Runs `prisma migrate diff --exit-code` between the applied migrations
 * directory and the current `schema.prisma`. Exit codes:
 *   0  — no drift (schema is fully covered by migrations)
 *   1  — fatal error running the diff
 *   2  — drift detected (schema has changes not in migrations)
 *
 * CI usage (GitHub Actions / Drone / etc.):
 *   npm run db:check-drift
 *
 * Local usage before committing a schema change:
 *   npx tsx scripts/check-migration-drift.ts
 *
 * If drift is detected, create a migration with:
 *   npx prisma migrate dev --name <short-description>
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const SCHEMA = resolve(ROOT, 'prisma', 'schema.prisma');
const MIGRATIONS = resolve(ROOT, 'prisma', 'migrations');

function fail(msg: string, code = 1): never {
  console.error(`\n[migration-drift] ${msg}\n`);
  process.exit(code);
}

if (!existsSync(SCHEMA)) {
  fail(`schema.prisma not found at ${SCHEMA}`);
}
if (!existsSync(MIGRATIONS)) {
  fail(`migrations directory not found at ${MIGRATIONS}`);
}

const cmd = [
  'npx prisma migrate diff',
  `--from-migrations "${MIGRATIONS}"`,
  `--to-schema-datamodel "${SCHEMA}"`,
  '--shadow-database-url "$SHADOW_DATABASE_URL"',
  '--exit-code',
].join(' ');

// --exit-code semantics from the Prisma CLI:
//   0 → no diff, 1 → error, 2 → diff detected.
try {
  execSync(cmd, { stdio: 'inherit', shell: 'bash' });
  console.log('[migration-drift] OK — no drift.');
  process.exit(0);
} catch (err) {
  const status = (err as { status?: number }).status ?? 1;
  if (status === 2) {
    fail(
      'DRIFT DETECTED. Run `npx prisma migrate dev --name <desc>` to create a migration.',
      2,
    );
  }
  fail(
    `prisma migrate diff failed (exit ${status}). Check your SHADOW_DATABASE_URL / DATABASE_URL env vars.`,
    1,
  );
}
