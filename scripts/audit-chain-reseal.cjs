#!/usr/bin/env node
/**
 * Recompute the audit_logs tamper-evident hash chain.
 *
 * DEFAULT MODE IS DRY RUN. Applying the re-seal requires both:
 *   1. --apply
 *   2. RESEAL_CONFIRM=I_HAVE_A_BACKUP
 *
 * This is a deliberate tamper-evident reset. Use only after:
 *   - PR #20 / audit append serialization is deployed,
 *   - production diagnosis confirms a benign race/fork,
 *   - public.audit_logs has been backed up and verified.
 */

const crypto = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const AUDIT_CHAIN_LOCK_KEY = BigInt('874163209');
const APPLY = process.argv.includes('--apply');
const CONFIRMED = process.env.RESEAL_CONFIRM === 'I_HAVE_A_BACKUP';

function auditHash(prevHash, payload) {
  return crypto
    .createHash('sha256')
    .update(prevHash)
    .update(JSON.stringify(payload ?? {}))
    .digest('hex');
}

function maskDatabaseUrl(value) {
  return value.replace(/:\/\/[^@]*@/, '://***@');
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Refusing to continue.');
  }
  if (APPLY && !CONFIRMED) {
    throw new Error(
      'Refusing to apply: set RESEAL_CONFIRM=I_HAVE_A_BACKUP after verifying the audit_logs backup.',
    );
  }

  console.log(`[audit-reseal] database = ${maskDatabaseUrl(process.env.DATABASE_URL)}`);
  console.log(`[audit-reseal] mode     = ${APPLY ? 'APPLY' : 'DRY_RUN'}`);

  // Prisma 7 in this repo runs on the pg driver adapter (no built-in query
  // engine), so the client MUST be constructed with a PrismaPg adapter —
  // mirroring PrismaService. A bare `new PrismaClient()` throws.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const rows = await prisma.auditLog.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, payload: true, hash: true, prevHash: true },
    });

    let prevHash = 'GENESIS';
    let firstBreakAt = null;
    const updates = [];

    for (const row of rows) {
      const expectedHash = auditHash(prevHash, row.payload ?? {});
      if (!firstBreakAt && (row.prevHash !== prevHash || row.hash !== expectedHash)) {
        firstBreakAt = row.id;
      }
      if (row.prevHash !== prevHash || row.hash !== expectedHash) {
        updates.push({ id: row.id, prevHash, hash: expectedHash });
      }
      prevHash = expectedHash;
    }

    console.log(`[audit-reseal] rows          = ${rows.length}`);
    console.log(`[audit-reseal] firstBreakAt  = ${firstBreakAt ?? '(none)'}`);
    console.log(`[audit-reseal] rowsToRewrite = ${updates.length}`);

    if (!APPLY) {
      console.log('[audit-reseal] dry run complete; no rows written.');
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY})`;
      for (const update of updates) {
        await tx.auditLog.update({
          where: { id: update.id },
          data: { prevHash: update.prevHash, hash: update.hash },
        });
      }
    });

    console.log('[audit-reseal] apply complete.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[audit-reseal] failed:', error);
  process.exit(1);
});
